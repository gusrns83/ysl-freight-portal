import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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
            pol, pod, carrier, rateType, currentRate, staffEmails,
            etdFrom, etdTo } = await req.json();

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
