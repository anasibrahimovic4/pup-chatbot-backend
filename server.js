import express from "express";
import cors from "cors";
import multer from "multer";
import pdf from "pdf-parse";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const upload = multer({ storage: multer.memoryStorage() });

let knowledgeText = "";

// Absolutna pot do pup.pdf (bolj zanesljivo kot "./pup.pdf")
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PDF_PATH = path.join(__dirname, "pup.pdf");

// Preberi PDF ob zagonu (ne uporabljaj top-level await)
async function loadPdfAtStartup() {
  try {
    const dataBuffer = fs.readFileSync(PDF_PATH);
    const parsed = await pdf(dataBuffer);
    knowledgeText = (parsed.text || "").trim();
    console.log("PDF samodejno naložen. Znakov:", knowledgeText.length);
  } catch (err) {
    knowledgeText = "";
    console.log(
      "PDF ni bil najden ob zagonu (pup.pdf). Lahko ga naložiš preko /upload ali /init/pdf."
    );
  }
}

// Root
app.get("/", (req, res) => res.send("PUP Chatbot backend running"));

// Health
app.get("/health", (req, res) => res.status(200).send("ok"));

// Upload UI
app.get("/upload", (req, res) => {
  res.send(`
    <h2>Naloži PDF dokument</h2>
    <form action="/init/pdf" method="post" enctype="multipart/form-data">
      <input type="file" name="file" accept="application/pdf" />
      <button type="submit">Naloži PDF</button>
    </form>
    <p>Trenutno naloženo znanje: <b>${knowledgeText ? "DA" : "NE"}</b></p>
  `);
});

// Ročni upload PDF (osveži knowledgeText)
app.post("/init/pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Manjka PDF." });

    const parsed = await pdf(req.file.buffer);
    knowledgeText = (parsed.text || "").trim();

    return res.json({
      ok: true,
      message: "PDF uspešno naložen.",
      chars: knowledgeText.length,
    });
  } catch (e) {
    return res.status(500).json({ error: "Napaka pri branju PDF." });
  }
});

// Widget stran
app.get("/widget", (req, res) => {
  res.send(`
<!doctype html>
<html lang="sl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>PUP Chatbot</title>
</head>
<body style="font-family:system-ui,Arial;margin:0;padding:12px;background:#f6f6f6">
  <div style="background:#fff;border:1px solid #ccc;border-radius:10px;padding:12px">
    <h3 style="margin:0 0 10px 0">Chatbot PUP Velenje</h3>
    <div id="chatbox" style="border:1px solid #ccc;border-radius:10px;padding:10px;height:280px;overflow:auto;background:#fff"></div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <input id="msg" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:10px" placeholder="Vprašaj o PUP Velenje..." />
      <button id="send" style="padding:10px 14px;border:1px solid #ccc;border-radius:10px;cursor:pointer">Pošlji</button>
    </div>
    <small style="color:#666">Če odgovora ni v PDF: "Tega v dokumentu ne najdem."</small>
  </div>

<script>
  // relativna pot (deluje tudi, če je app pod /nekaj/)
  const API = "chat";
  const chatbox = document.getElementById("chatbox");
  const msg = document.getElementById("msg");
  const send = document.getElementById("send");

  function add(who, text){
    const div = document.createElement("div");
    div.style.margin = "8px 0";
    div.innerHTML = "<b>" + who + ":</b> " + (text ?? "");
    chatbox.appendChild(div);
    chatbox.scrollTop = chatbox.scrollHeight;
  }

  add("Bot", "Živjo! Postavi mi vprašanje.");

  async function sendMsg(){
    const text = msg.value.trim();
    if(!text) return;

    add("Ti", text);
    msg.value = "";

    add("Bot", "...");
    const last = chatbox.lastChild;

    try{
      const r = await fetch(API, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ message: text })
      });

      const data = await r.json().catch(() => ({}));
      last.remove();

      add("Bot", data.reply || data.error || "Napaka");
    } catch(e){
      last.remove();
      add("Bot", "Napaka pri povezavi do strežnika.");
    }
  }

  send.addEventListener("click", sendMsg);
  msg.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMsg();
  });
</script>
</body>
</html>
  `);
});

// Embed stran (robustno: iframe wrapper, brez redirect/ping)
app.get("/embed", (req, res) => {
  res.send(`
<!doctype html>
<html lang="sl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>PUP Chatbot Embed</title>
</head>
<body style="margin:0;padding:0">
  <iframe
    src="widget"
    style="border:0;width:100vw;height:100vh"
    allow="clipboard-read; clipboard-write"
  ></iframe>
</body>
</html>
  `);
});

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();

    if (!message) return res.status(400).json({ error: "Manjka sporočilo." });

    if (!knowledgeText) {
      return res.status(400).json({
        error: "Najprej naloži PDF (/upload ali pup.pdf v repo).",
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        error: "Manjka GROQ_API_KEY v okolju (Render Environment Variables).",
      });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Odgovarjaj v slovenščini in samo na podlagi podanega besedila. Če odgovora ni v dokumentu, napiši: 'Tega v dokumentu ne najdem.'",
          },
          {
            role: "user",
            content: `PDF vsebina:\\n${knowledgeText}\\n\\nVprašanje:\\n${message}`,
          },
        ],
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(500).json({
        error: "Napaka pri klicu Groq API.",
        detail: data?.error?.message || data?.message || "Neznana napaka.",
      });
    }

    return res.json({
      reply: data?.choices?.[0]?.message?.content || "Napaka pri odgovoru.",
    });
  } catch (e) {
    return res.status(500).json({ error: "Napaka strežnika." });
  }
});

// Start
const PORT = process.env.PORT || 3000;

loadPdfAtStartup().finally(() => {
  app.listen(PORT, () => console.log("Server running on port", PORT));
});
