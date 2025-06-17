// backend/server.js - GÜNCELLENMİŞ VERSİYON

const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

const AUTH_URL = `https://${process.env.IKAS_STORE_NAME}.myikas.com/api/admin/oauth/token`;
const GRAPHQL_API_URL = 'https://api.myikas.com/api/v1/admin/graphql';

let tokenCache = { accessToken: null, expiresAt: 0 };
let customerAttributeMap = {};

const executeIkasQuery = async (query, variables) => {
    if (!tokenCache.accessToken || Date.now() > tokenCache.expiresAt) {
        console.log("Token süresi dolmuş, yeni token alınıyor...");
        const params = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET
        });
        const authResponse = await axios.post(AUTH_URL, params);
        tokenCache.accessToken = authResponse.data.access_token;
        tokenCache.expiresAt = Date.now() + (authResponse.data.expires_in * 1000 * 0.9);
        console.log("Yeni token başarıyla alındı.");
    }
    const graphqlResponse = await axios.post(GRAPHQL_API_URL, { query, variables }, {
        headers: { 'Authorization': `Bearer ${tokenCache.accessToken}` }
    });
    if (graphqlResponse.data.errors) {
        console.error("GraphQL API Hatası:", JSON.stringify(graphqlResponse.data.errors, null, 2));
        throw new Error(`GraphQL Hatası: ${graphqlResponse.data.errors[0].message}`);
    }
    return graphqlResponse.data;
};

const fetchAndCacheCustomerAttributes = async () => {
    try {
        console.log("Müşteri özel alan tanımları çekiliyor...");
        const query = `{ listCustomerAttribute { id, name } }`;
        const data = await executeIkasQuery(query, {});
        customerAttributeMap = data.data.listCustomerAttribute.reduce((map, attr) => {
            map[attr.id] = attr.name;
            return map;
        }, {});
        console.log("Özel alan haritası başarıyla oluşturuldu:", customerAttributeMap);
    } catch (error) {
        console.error("!!! Sunucu başlangıcında özel alanlar çekilemedi:", error.message);
    }
};

app.use(cors());
app.use(express.json());

app.get('/api/customers', async (req, res) => {
    try {
        const { page = 1, limit = 20, search, id } = req.query;
        const query = `
            query GetCustomers($pagination: PaginationInput, $search: String, $id: StringFilterInput) {
                listCustomer(pagination: $pagination, search: $search, id: $id) {
                    data {
                        id, firstName, lastName, email, phone, fullName, orderCount, totalOrderPrice,
                        attributes { customerAttributeId, value }
                    }
                }
            }
        `;
        const result = await executeIkasQuery(query, {
            pagination: { page: parseInt(page), limit: parseInt(limit) },
            ...(search && { search }),
            ...(id && { id: { eq: id } })
        });
        res.status(200).json(result.data.listCustomer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/api/orders/customer/:customerId', async (req, res) => {
    try {
        const { customerId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        // ✅ GÜNCELLENMİŞ SORGULAMA: Daha fazla finansal detay eklendi.
        const query = `
            query GetOrders($pagination: PaginationInput, $customerId: StringFilterInput) {
                listOrder(pagination: $pagination, customerId: $customerId) {
                    data {
                        id, orderNumber, status, note, totalPrice, totalFinalPrice, currencyCode, orderedAt,
                        shippingAddress { firstName, lastName, addressLine1, city { name }, district { name }, phone },
                        paymentMethods { type, price, paymentGatewayName },
                        shippingLines { title, price },
                        taxLines { price, rate },
                        orderAdjustments { name, amount, type },
                        orderLineItems {
                            id, quantity, price, finalPrice,
                            variant { id, name, sku, variantValues { variantTypeName, variantValueName } }
                        }
                    }
                }
            }
        `;
        const result = await executeIkasQuery(query, {
            pagination: { page: parseInt(page), limit: parseInt(limit) },
            customerId: { eq: customerId }
        });
        res.status(200).json(result.data.listOrder);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Sunucu (Nihai Versiyon) port ${PORT} üzerinde çalışıyor.`);
    fetchAndCacheCustomerAttributes();
});