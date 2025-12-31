import OpenAI from "openai";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import dotenv from "dotenv";
import { Document, Packer, Paragraph, convertInchesToTwip } from "docx";

// Configuration
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialisation Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: [
    "https://generateur-de-fiche-de-poste.vercel.app",
    "http://localhost:1303",
    "http://localhost:3000"
  ],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
  exposedHeaders: ["Content-Disposition", "Content-Length"]
}));
app.use(express.json());
app.use(express.static('public'));

// Configuration OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ==================== PROMPT PROFESSIONNEL ====================
const SYSTEM_PROMPT = `Tu es un rédacteur expert en Ressources Humaines pour les grandes entreprises. Ta mission est de créer des fiches de poste **haut de gamme, structurées et prêtes à être publiées** en français, en suivant **rigoureusement** la structure et le style fournis.

STRUCTURE À REPRODUIRE À LA LETTRE :
\`\`\`
Le poste
Descriptif du poste
Au sein de [Nom de l'entreprise], le [Nom du Département/Pôle] a pour objectif de [Objectif principal]. [Deuxième phrase développant la mission].

[Si pertinent : Le Pôle regroupe...]

Rattaché hiérarchiquement au [Titre du responsable], le/la [Titre du poste] sera en lien avec :
    • [Catégorie d'interlocuteurs 1]
    • [Catégorie d'interlocuteurs 2]

Le/La [Titre du poste] [description du rôle et des responsabilités générales].
Il/Elle est garant(e) de [objectif 1] et de [objectif 2].

Missions principales

[Catégorie de missions 1]
    • [Mission 1.1 : Phrase détaillée avec verbe à l'infinitif]
    • [Mission 1.2 : Autre mission détaillée]

[Catégorie de missions 2]
    • [Mission 2.1 : Phrase détaillée]
    • [Mission 2.2 : ...]

Responsabilités clés
    • [Responsabilité 1 : Phrase concise]
    • [Responsabilité 2 : Phrase concise]
    • [Responsabilité 3 : Phrase concise]

[Ligne de responsabilité globale si nécessaire]

Profil recherché
    • [Critère 1 : Formation]
    • [Critère 2 : Expérience]
    • [Critère 3 : Qualités personnelles]
    • [Critère 4 : Compétences comportementales]
    • [Critère 5 : Compétences techniques]
    • [Critère 6 : Atouts]
    • [Critère 7 : Langues]

[Signature / Présentation de l'entreprise]
[Description élégante de l'entreprise, 2-3 lignes]
\`\`\`

INSTRUCTIONS STRICTES :
1. INVENTE de manière crédible tous les détails manquants (noms de départements, sigles, catégories de missions).
2. DÉVELOPPE les informations brutes fournies en phrases professionnelles.
3. UTILISE la troisième personne jusqu'à "Profil recherché", puis la deuxième personne ("Vous êtes...").
4. RESPECTE exactement la mise en forme ci-dessus (titres, puces, retraits).
5. TON : Professionnel, élégant, précis.

Tu vas maintenant recevoir des informations pour un poste. Génère immédiatement la fiche de poste complète.`;

// ==================== FONCTIONS UTILITAIRES ====================
function cleanInput(text) {
  if (!text) return [];
  return text
    .replace(/\n/g, '; ')
    .replace(/,/g, ';')
    .split(';')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

function buildUserPrompt(data) {
  let prompt = "Informations pour le nouveau poste :\n\n";
  
  prompt += `- Titre du poste : ${data.titre}\n`;
  prompt += `- Entreprise : ${data.entreprise}\n`;
  prompt += `- Secteur d'activité : ${data.secteur}\n`;
  
  const missions = cleanInput(data.missions);
  prompt += `- Missions principales : ${missions.join('; ')}\n`;
  
  const techSkills = cleanInput(data.competences_tech);
  if (techSkills.length > 0) {
    prompt += `- Compétences techniques : ${techSkills.join(', ')}\n`;
  }
  
  const softSkills = cleanInput(data.competences_soft);
  if (softSkills.length > 0) {
    prompt += `- Compétences comportementales : ${softSkills.join(', ')}\n`;
  }
  
  if (data.experience) {
    prompt += `- Niveau d'expérience : ${data.experience}\n`;
  }
  
  const avantages = cleanInput(data.avantages);
  if (avantages.length > 0) {
    prompt += `- Avantages : ${avantages.join(', ')}\n`;
  }
  
  prompt += "\nGénère maintenant la fiche de poste complète :";
  return prompt;
}

function generateWordDocument(content, data) {
  try {
    // Générer un vrai document Word avec la libraire docx
    const paragraphs = [];
    
    // Titre : Entreprise
    paragraphs.push(new Paragraph({
      text: data.entreprise,
      bold: true,
      size: 24 * 2, // 24pt
    }));
    
    // Titre : Fiche de poste
    paragraphs.push(new Paragraph({
      text: `FICHE DE POSTE : ${data.titre}`,
      bold: true,
      size: 22 * 2,
    }));
    
    // Contenu : diviser par lignes et créer des paragraphes
    const lines = content.split('\n').filter(line => line.trim());
    lines.forEach(line => {
      paragraphs.push(new Paragraph({
        text: line,
        size: 11 * 2, // 11pt
      }));
    });
    
    // Créer le document
    const doc = new Document({
      sections: [{
        properties: {},
        children: paragraphs,
      }],
    });
    
    // Générer le buffer
    return Packer.toBuffer(doc);
  } catch (error) {
    console.error('Erreur lors de la génération du Word:', error);
    return generateSimpleWordDocument(content, data);
  }
}

function generateSimpleWordDocument(content, data) {
  // Fallback : document basique avec docx
  const paragraphs = [
    new Paragraph({
      text: data.entreprise,
      bold: true,
    }),
    new Paragraph({
      text: `FICHE DE POSTE : ${data.titre}`,
      bold: true,
    }),
  ];
  
  content.split('\n').forEach(line => {
    if (line.trim()) {
      paragraphs.push(new Paragraph({ text: line }));
    }
  });
  
  const doc = new Document({
    sections: [{
      properties: {},
      children: paragraphs,
    }],
  });
  
  return Packer.toBuffer(doc);
}

function saveToFile(content, titre, format = 'txt') {
  const fichesDir = path.join(__dirname, 'fiches');
  
  // Crée le dossier s'il n'existe pas
  if (!fs.existsSync(fichesDir)) {
    fs.mkdirSync(fichesDir, { recursive: true });
  }
  
  // Génère un nom de fichier unique
  const timestamp = new Date().toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .split('.')[0];
  
  const safeTitre = titre
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 50);
  
  const filename = `fiche_${safeTitre}_${timestamp}.${format}`;
  const filepath = path.join(fichesDir, filename);
  
  // Écrit le fichier
  fs.writeFileSync(filepath, content);
  
  return {
    filename,
    filepath,
    fullPath: path.resolve(filepath),
    filesize: fs.statSync(filepath).size
  };
}

// ==================== ROUTES API ====================

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Route pour générer la fiche
app.post('/api/generate-fiche', async (req, res) => {
  try {
    const data = req.body;
    
    // Validation
    if (!data.titre || !data.entreprise || !data.secteur || !data.missions) {
      return res.status(400).json({
        error: 'Les champs titre, entreprise, secteur et missions sont obligatoires'
      });
    }
    
    console.log(`📝 Génération fiche pour: ${data.titre} - ${data.entreprise}`);
    
    // Construire le prompt
    const userPrompt = buildUserPrompt(data);
    
    // Appel à l'API OpenAI
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2500,
    });
    
    // Récupérer le résultat et nettoyer le contenu des backticks
    let ficheContent = completion.choices[0].message.content || '';
    // Supprimer les blocs de code markdown ```
    ficheContent = ficheContent.replace(/```/g, '').trim();

    // Générer le document Word (en mémoire)
    const wordBuffer = generateWordDocument(ficheContent, data);

    // Générer un nom de fichier cohérent
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .split('.')[0];

    const safeTitre = (data.titre || 'fiche')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 50);

    const filename = `fiche_${safeTitre}_${timestamp}.docx`;

    // Sauvegarder le fichier sur le serveur (dans /fiches)
    const saved = saveToFile(wordBuffer, data.titre, 'docx');

    // Répondre en JSON avec l'URL de téléchargement
    res.json({
      success: true,
      filename: saved.filename,
      downloadUrl: `/api/download-fiche/${saved.filename}`,
      preview: ficheContent
    });
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    
    let errorMessage = 'Erreur lors de la génération';
    let statusCode = 500;
    
    if (error.code === 'invalid_api_key') {
      errorMessage = 'Clé API OpenAI invalide';
      statusCode = 401;
    } else if (error.code === 'insufficient_quota') {
      errorMessage = 'Quota API insuffisant';
      statusCode = 402;
    } else if (error.code === 'rate_limit_exceeded') {
      errorMessage = 'Limite de requêtes dépassée';
      statusCode = 429;
    } else if (error.message.includes('401')) {
      errorMessage = 'Permission refusée - Clé API invalide';
      statusCode = 401;
    }
    
    res.status(statusCode).json({
      error: errorMessage,
      details: error.message
    });
  }
});

// Route pour télécharger une fiche
app.get('/api/download-fiche/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'fiches', filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }
    
    // Déterminer le type de contenu
    let contentType = 'text/plain';
    if (filename.endsWith('.docx')) {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (filename.endsWith('.pdf')) {
      contentType = 'application/pdf';
    }
    
    // Lire le fichier
    const fileBuffer = fs.readFileSync(filepath);
    
    // Configurer les headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    
    // Envoyer le fichier
    res.send(fileBuffer);
    
  } catch (error) {
    console.error('❌ Erreur de téléchargement:', error);
    res.status(500).json({ error: 'Erreur lors du téléchargement' });
  }
});

// Route pour lister les fiches générées
app.get('/api/list-fiches', (req, res) => {
  try {
    const fichesDir = path.join(__dirname, 'fiches');
    
    if (!fs.existsSync(fichesDir)) {
      return res.json({ fiches: [] });
    }
    
    const files = fs.readdirSync(fichesDir);
    const fiches = files.map(filename => {
      const filepath = path.join(fichesDir, filename);
      const stats = fs.statSync(filepath);
      
      return {
        filename,
        filepath,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        type: filename.split('.').pop()
      };
    });
    
    res.json({ fiches });
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: 'Erreur lors de la liste des fiches' });
  }
});

// Servir le frontend si en production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../frontend');
  app.use(express.static(frontendPath));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Route racine simple pour éviter les timeouts de cold start
app.get('/', (req, res) => {
  res.send('Backend Job Generator OK 🚀');
});

// ==================== LANCEMENT DU SERVEUR ====================
// Vérification de la clé API
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('ta_clé_api_ici')) {
  console.error('❌ ERREUR : Clé API OpenAI non configurée !');
  console.log('\n📋 CONFIGURATION REQUISE :');
  console.log('1. Créez un fichier .env à la racine du backend');
  console.log('2. Ajoutez cette ligne :');
  console.log('   OPENAI_API_KEY=sk-votre_clé_api_réelle');
  console.log('\n3. Votre clé se trouve sur : https://platform.openai.com/api-keys');
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`🚀 Serveur backend démarré sur le port ${PORT}`);
  console.log(`🌐 Frontend accessible sur : http://localhost:${PORT}/frontend`);
  console.log(`🔗 API disponible sur : http://localhost:${PORT}/api`);
  console.log('\n📋 Routes disponibles :');
  console.log('  GET  /api/health          - Vérifier l\'état du serveur');
  console.log('  POST /api/generate-fiche  - Générer une nouvelle fiche');
  console.log('  GET  /api/download-fiche/:filename - Télécharger une fiche');
  console.log('  GET  /api/list-fiches     - Lister toutes les fiches');
});
