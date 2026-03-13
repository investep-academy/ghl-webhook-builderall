const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, options, timeoutMs = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function postToFormsWithRetry(FORM_URL, options, retries = 3) {
  let lastStatus = null;
  let lastBody = "";
  let lastErr = null;

  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetchWithTimeout(FORM_URL, options, 8000);
      lastStatus = resp.status;

      const text = await resp.text();
      lastBody = text;

      if (resp.status === 200 || resp.status === 302) {
        return { resp, text };
      }

      console.error(
        `⚠️ Forms intento ${i + 1}/${retries} status=${resp.status} body(200)=`,
        text.slice(0, 200)
      );
    } catch (e) {
      lastErr = e;
      console.error(`❌ Forms intento ${i + 1}/${retries} error:`, e?.message || e);
    }

    const wait = 250 + i * i * 500;
    await sleep(wait);
  }

  const err = new Error(
    lastErr
      ? `Forms failed after retries: ${lastErr.message || lastErr}`
      : `Forms bad status after retries: ${lastStatus}`
  );
  err.lastStatus = lastStatus;
  err.lastBody = lastBody;
  throw err;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const FORM_URL =
    "https://docs.google.com/forms/d/e/1FAIpQLSejnx7_WsiczmkwhtemyINVbzfp3v7kE9BpQypmtXCc9dYkSg/formResponse";

  const data = req.body || {};
  const parsed =
    typeof data === "string"
      ? (() => {
          try {
            return JSON.parse(data);
          } catch {
            return {};
          }
        })()
      : data;

  const pick = (...keys) => {
    for (const k of keys) {
      if (parsed?.[k] !== undefined && parsed[k] !== null) {
        return String(parsed[k]);
      }
    }
    return "";
  };

  const cleanPhone = (value) =>
    String(value || "")
      .replace(/^\+/, "")
      .replace(/\s/g, "");

  const date_confirmed = pick("date_confirmed", "dateConfirmed");
  const list_name = pick("list_name", "listName");
  const email = pick("email", "EMAIL");
  const fname = pick("fname", "first_name", "firstName", "FNAME");
  const apellido = pick("apellido", "last_name", "lastName", "APELLIDO");
  const tuasesor = pick("tuasesor", "TUASESOR");
  const asesores = pick("asesores", "ASESORES");
  const phoneprefixcodeid = pick("phoneprefixcodeid", "PHONEPREFIXCODEID");
  const phoneprefix = pick("phoneprefix", "PHONEPREFIX");
  const phone = cleanPhone(pick("phone", "PHONE"));

  const formParams = new URLSearchParams();

  // Mapeo exacto del nuevo Google Form
  formParams.append("entry.643366668", date_confirmed);
  formParams.append("entry.16713468", list_name);
  formParams.append("entry.2111787251", email);
  formParams.append("entry.1305904896", fname);
  formParams.append("entry.1969015055", apellido);
  formParams.append("entry.1553940646", tuasesor);
  formParams.append("entry.810381081", asesores);
  formParams.append("entry.2132332179", phoneprefixcodeid);
  formParams.append("entry.1385730406", phoneprefix);
  formParams.append("entry.956134344", phone);

  try {
    console.log("✅ Webhook recibido. Keys:", Object.keys(parsed || {}));
    console.log("🧾 Payload mapeado:", {
      date_confirmed,
      list_name,
      email,
      fname,
      apellido,
      tuasesor,
      asesores,
      phoneprefixcodeid,
      phoneprefix,
      phone,
    });

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
      },
      body: formParams.toString(),
      redirect: "manual",
    };

    const { resp, text } = await postToFormsWithRetry(FORM_URL, options, 3);

    console.log("📩 Forms status final:", resp.status);
    console.log("📩 Forms body (primeros 200):", text.slice(0, 200));

    return res.status(200).json({
      ok: true,
      formStatus: resp.status,
      sent: {
        date_confirmed,
        list_name,
        email,
        fname,
        apellido,
        tuasesor,
        asesores,
        phoneprefixcodeid,
        phoneprefix,
        phone,
      },
    });
  } catch (err) {
    console.error("❌ Falló envío a Forms tras reintentos:", err?.message || err);
    if (err?.lastStatus) console.error("❌ lastStatus:", err.lastStatus);
    if (err?.lastBody) {
      console.error("❌ lastBody(200):", (err.lastBody || "").slice(0, 200));
    }

    return res.status(200).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
};
