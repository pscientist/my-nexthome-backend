const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Dummy data — read local JSON file
const openHomes = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data/openHomes.json"), "utf-8")
);

// GET: list open homes
app.get("/api/open-homes", (req, res) => {
  res.json(openHomes);
});

// GET: single open home
app.get("/api/open-homes/:id", (req, res) => {
  const id = Number(req.params.id);
  const home = openHomes.find((item) => item.id === id);
  if (!home) {
    return res.status(404).json({ message: "Home not found" });
  }
  res.json(home);
});

// Start server
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
