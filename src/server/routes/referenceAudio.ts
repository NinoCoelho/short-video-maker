import express, { Router } from "express";
import fs from "fs";
import path from "path";

const router: Router = express.Router();
const referenceDir = path.join(process.cwd(), "reference_audio");

router.get("/", (req, res) => {
  fs.readdir(referenceDir, (err, files) => {
    if (err) return res.status(500).json({ error: "Erro ao listar arquivos" });
    const wavFiles = files.filter(f => f.endsWith(".wav") || f.endsWith(".mp3"));
    res.json(wavFiles);
  });
});

export default router; 