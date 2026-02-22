import express from "express";
import cors from "cors";
import multer from "multer";
import pdf from "pdf-parse";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const upload = multer({ storage: multer.memoryStorage() });

let knowledgeText = "";
// Preberi PDF ob zagonu strežnika
try {
  const dataBuffer = fs.readFileSync("./pup");
  const parsed = await pdf(dataBuffer);
  knowledgeText = parsed.text;
  console.log("PDF samodejno naložen.");
} catch (err) {
  console.log("PDF ni bil najden ob zagonu.");
}

// Root
app.get("/", (req, res) => {
  res.send("PUP Chatbot backend running");
});

// Health
app.get("/health", (req, res) => {
  res.send("ok");
});

app.get("/upload", (req, res) => {
  res.send(`
    <h2>Naloži PDF dokument</h2>
    <form action="/init/pdf" method="post" enctype="multipart/form-data">
      <input type="file" name="file" accept="application/pdf" />
      <button type="submit">Naloži PDF</button>
    </form>
  `);

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
    <h3 style="margin:0 0 10px 0">Chatbot PUP Velenje </h3>
    <div id="chatbox" style="border:1px solid #ccc;border-radius:10px;padding:10px;height:280px;overflow:auto;background:#fff"></div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <input id="msg" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:10px" placeholder="Vprašaj o PUP Velenje..." />
      <button id="send" style="padding:10px 14px;border:1px solid #ccc;border-radius:10px;cursor:pointer">Pošlji</button>
    </div>
    <small style="color:#666">Če odgovora ni v PDF: "Tega v dokumentu ne najdem."</small>
  </div>

<script>
const API = "/chat";
const chatbox = document.getElementById("chatbox");
const msg = document.getElementById("msg");
const send = document.getElementById("send");

function add(who, text){
  const div = document.createElement("div");
  div.style.margin = "8px 0";
  div.innerHTML = "<b>" + who + ":</b> " + text;
  chatbox.appendChild(div);
  chatbox.scrollTop = chatbox.scrollHeight;
}

add("Bot", "Živjo! Postavi mi vprašanje.");

send.addEventListener("click", async () => {
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
    const data = await r.json();
    last.remove();
    add("Bot", data.reply || data.error || "Napaka");
  } catch(e){
    last.remove();
    add("Bot", "Napaka pri povezavi do strežnika.");
  }
});
</script>
</body>
</html>
  `);
});
});

// PDF inicializacija
app.post("/init/pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Manjka PDF." });

    const parsed = await pdf(req.file.buffer);
    knowledgeText = parsed.text;

    res.json({ ok: true, message: "PDF uspešno naložen." });
  } catch {
    res.status(500).json({ error: "Napaka pri branju PDF." });
  }
});

// Chat
app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!knowledgeText) {
      return res.status(400).json({ error: "Najprej naloži PDF." });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "Odgovarjaj v slovenščini in samo na podlagi podanega besedila. Če odgovora ni v dokumentu, napiši: 'Tega v dokumentu ne najdem.'"
          },
          {
            role: "user",
            content: `PDF vsebina:\n${knowledgeText}\n\nVprašanje:\n${message}`
          }
        ]
      })
    });

    const data = await response.json();
    res.json({ reply: data.choices[0].message.content });

  } catch {
    res.status(500).json({ error: "Napaka strežnika." });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
