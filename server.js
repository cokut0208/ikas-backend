// server.js

const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config(); // .env dosyasındaki değişkenleri yükler

const app = express();
const PORT = process.env.PORT || 3001;

// Gelen isteklerin JSON formatında olmasını sağlar
app.use(express.json());
// Tüm kaynaklardan gelen isteklere izin ver (CORS sorununu çözer)
app.use(cors());

// Token ve süresini saklamak için değişkenler
let ikasToken = null;
let tokenExpiry = 0;

// Güvenli bir şekilde Access Token alan fonksiyon
const getAccessToken = async () => {
  // Eğer geçerli bir token varsa, onu kullan
  if (ikasToken && Date.now() < tokenExpiry) {
    return ikasToken;
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', process.env.CLIENT_ID);
    params.append('client_secret', process.env.CLIENT_SECRET);

    const response = await axios.post(
      `${process.env.STORE_URL}/api/admin/oauth/token`,
      params,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const tokenData = response.data;
    ikasToken = tokenData.access_token;
    // Token süresini %90'ı kadar ayarla (güvenlik için)
    tokenExpiry = Date.now() + tokenData.expires_in * 1000 * 0.9;

    console.log('Yeni ikas token alındı.');
    return ikasToken;
  } catch (error) {
    console.error('Token alma hatası:', error.response ? error.response.data : error.message);
    throw new Error('ikas API token alınamadı.');
  }
};

// React uygulamasından gelen istekleri karşılayacak ana endpoint
app.post('/api/ikas', async (req, res) => {
  const { query, variables } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'GraphQL sorgusu eksik.' });
  }

  try {
    const token = await getAccessToken();

    const ikasResponse = await axios.post(
      'https://api.myikas.com/api/v1/admin/graphql',
      {
        query,
        variables,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (ikasResponse.data.errors) {
        console.error('ikas GraphQL Hatası:', ikasResponse.data.errors);
        return res.status(400).json({ errors: ikasResponse.data.errors });
    }

    // Başarılı olursa veriyi React uygulamasına geri gönder
    res.json(ikasResponse.data);

  } catch (error) {
    console.error('Proxy isteği hatası:', error.message);
    res.status(500).json({ error: 'Sunucu tarafında bir hata oluştu.' });
  }
});

app.listen(PORT, () => {
  console.log(`ikas proxy sunucusu ${PORT} portunda çalışıyor.`);
});