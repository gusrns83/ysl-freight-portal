import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SB_URL = Deno.env.get("SUPABASE_URL");
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");

// 직원 수신 이메일을 service role로 직접 조회 (고객/anon에 미노출)
async function fetchStaffEmails(): Promise<string[]> {
  try {
    if (!SB_URL || !SB_SERVICE_KEY) return [];
    const r = await fetch(`${SB_URL}/rest/v1/settings?select=value&key=eq.quote_staff_emails`, {
      headers: { apikey: SB_SERVICE_KEY, Authorization: `Bearer ${SB_SERVICE_KEY}` },
    });
    if (!r.ok) return [];
    const rows = await r.json();
    const raw = rows?.[0]?.value;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e: unknown) => typeof e === "string" && (e as string).trim()) : [];
  } catch { return []; }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { customerEmail, containerQty, cargoName, targetRate,
            pol, pod, carrier, rateType, currentRate,
            etdFrom, etdTo, comment } = await req.json();
    const staffEmails = await fetchStaffEmails();

    const escapeHtml = (s: string) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // "2026-06-15" → "15.Jun" (이미 문자열이면 그대로 사용)
    const fmtEtd = (v: string) => {
      if (!v) return "";
      const d = new Date(v);
      if (isNaN(d.getTime())) return v;
      const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
      return `${d.getDate()}.${mon}`;
    };
    const etdLabel = etdFrom || etdTo
      ? [fmtEtd(etdFrom), fmtEtd(etdTo)].filter(Boolean).join(" - ")
      : "-";

    // Resend 무료 계정: 도메인 인증 전까지 계정 이메일로만 발송 가능
    const to = staffEmails && staffEmails.length ? staffEmails : ["gusrns83@gmail.com"];

    const html = `
      <h2>새 견적 요청</h2>
      <table border="1" cellpadding="8" style="border-collapse:collapse">
        <tr><td><b>고객 이메일</b></td><td>${customerEmail}</td></tr>
        <tr><td><b>POL</b></td><td>${pol || "-"}</td></tr>
        <tr><td><b>POD</b></td><td>${pod || "-"}</td></tr>
        <tr><td><b>ETD (희망 스케줄)</b></td><td>${etdLabel}</td></tr>
        <tr><td><b>선사</b></td><td>${carrier || "-"}</td></tr>
        <tr><td><b>운임 유형</b></td><td>${rateType || "-"}</td></tr>
        <tr><td><b>현재 운임</b></td><td>${currentRate ? `${currentRate} USD` : "-"}</td></tr>
        <tr><td><b>컨테이너 수량</b></td><td>${containerQty || "-"}</td></tr>
        <tr><td><b>화물명</b></td><td>${cargoName || "-"}</td></tr>
        <tr><td><b>Target 운임</b></td><td>${targetRate ? `${targetRate} USD` : "-"}</td></tr>
        <tr><td><b>Comment</b></td><td>${comment ? escapeHtml(comment).replace(/\n/g, "<br>") : "-"}</td></tr>
      </table>
      <p>YSL Freight Portal 자동 발송 메일</p>
    `;

    const sendMail = (recipients: string[]) => fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "YSL Portal <onboarding@resend.dev>",
        to: recipients,
        subject: `[견적요청] ${pol || ""} ${carrier || ""} - ${customerEmail}`,
        html,
      }),
    });

    let res = await sendMail(to);
    let data = await res.json();
    // Resend 무료 계정: 도메인 미인증 시 계정 이메일로만 발송 가능 → 폴백
    if (data?.statusCode === 403 && String(data?.message || "").includes("own email address")) {
      res = await sendMail(["gusrns83@gmail.com"]);
      data = await res.json();
      if (data?.id) data = { ...data, fallback: "staff emails blocked (domain not verified) — sent to account email" };
    }
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
