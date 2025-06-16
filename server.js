// server.js - GÜNCELLENMİŞ HATA YÖNETİMİ

const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cors());

let ikasToken = null;
let tokenExpiry = 0;

const getAccessToken = async () => {
  if (ikasToken && Date.now() < tokenExpiry) {
    return ikasToken;
  }
  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', process.env.CLIENT_ID);
    params.append('client_secret', process.env.CLIENT_SECRET);
    const response = await axios.post(`${process.env.STORE_URL}/api/admin/oauth/token`, params);
    const tokenData = response.data;
    ikasToken = tokenData.access_token;
    tokenExpiry = Date.now() + tokenData.expires_in * 1000 * 0.9;
    console.log('Yeni ikas token alındı.');
    return ikasToken;
  } catch (error) {
    console.error('Token alma hatası:', error.response ? error.response.data : error.message);
    throw new Error('ikas API token alınamadı.');
  }
};

app.post('/api/ikas', async (req, res) => {
  const { query, variables } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'GraphQL sorgusu eksik.' });
  }

  try {
    const token = await getAccessToken();
    const ikasResponse = await axios.post(
      'https://api.myikas.com/api/v1/admin/graphql',
      { query, variables },
      { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }
    );
    if (ikasResponse.data.errors) {
      console.error('ikas GraphQL Hatası:', ikasResponse.data.errors);
      return res.status(400).json({ errors: ikasResponse.data.errors });
    }
    res.json(ikasResponse.data);
  } catch (error) {
    // === DEĞİŞİKLİK BURADA ===
    // Artık ikas'tan gelen hatanın tüm detayını logluyoruz.
    console.error('Proxy isteği hatası DETAYI:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    res.status(500).json({ 
        error: 'Sunucu tarafında bir hata oluştu.', 
        details: error.response ? error.response.data : 'Detay alınamadı' 
    });
  }
});

app.listen(PORT, () => {
  console.log(`ikas proxy sunucusu ${PORT} portunda çalışıyor.`);
});