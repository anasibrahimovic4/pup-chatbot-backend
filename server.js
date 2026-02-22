import express from "express";
import cors from "cors";
import multer from "multer";
import pdf from "pdf-parse";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const upload = multer({ storage: multer.memoryStorage() });

let knowledgeText = "";

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
