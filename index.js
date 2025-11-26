const express = require("express");
const cors = require("cors");
const axios = require("axios");
const dotenv = require("dotenv");
const OAuth = require("oauth-1.0a");
const crypto = require("crypto");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// TradeMe API configuration
// Set TRADEME_ENV to 'sandbox' or 'production' (defaults to production)
const TRADEME_ENV = process.env.TRADEME_ENV || 'production';
const TRADEME_API_BASE = TRADEME_ENV === 'sandbox'
  ? "https://api.tmsandbox.co.nz/v1"
  : "https://api.trademe.co.nz/v1";
const TRADEME_CONSUMER_KEY = process.env.TRADEME_CONSUMER_KEY;
const TRADEME_CONSUMER_SECRET = process.env.TRADEME_CONSUMER_SECRET;

// Validate that credentials are set
if (!TRADEME_CONSUMER_KEY || !TRADEME_CONSUMER_SECRET) {
  console.error('ERROR: TRADEME_CONSUMER_KEY and TRADEME_CONSUMER_SECRET must be set in environment variables');
  console.error('Create a .env file with:');
  console.error('TRADEME_CONSUMER_KEY=your-key');
  console.error('TRADEME_CONSUMER_SECRET=your-secret');
  console.error('TRADEME_ENV=sandbox (or production)');
} else {
  console.log(`TradeMe API configured for: ${TRADEME_ENV} environment`);
  console.log(`API Base URL: ${TRADEME_API_BASE}`);
}

// Initialize OAuth 1.0a - create function to get fresh instance with credentials
function getOAuthInstance(signatureMethod = "HMAC-SHA1") {
  if (!TRADEME_CONSUMER_KEY || !TRADEME_CONSUMER_SECRET) {
    throw new Error('TradeMe API credentials not configured');
  }

  const config = {
    consumer: {
      key: TRADEME_CONSUMER_KEY,
      secret: TRADEME_CONSUMER_SECRET,
    },
    signature_method: signatureMethod,
  };

  // Only add hash_function for HMAC-SHA1
  if (signatureMethod === "HMAC-SHA1") {
    config.hash_function = (base_string, key) => {
      return crypto.createHmac("sha1", key).update(base_string).digest("base64");
    };
  }

  return OAuth(config);
}

// Helper function to fetch listings with open homes
async function fetchOpenHomes() {
  if (!TRADEME_CONSUMER_KEY || !TRADEME_CONSUMER_SECRET) {
    throw new Error('TradeMe API credentials not configured');
  }

  try {
    // Try Search API endpoint instead - may have better public access
    const url = `${TRADEME_API_BASE}/Search/Property/Residential.json`;
    const params = {
      category: '3399', // Residential for sale
      rows: 50, // Adjust as needed
      // Add other search parameters as needed
    };

    // Try HMAC-SHA1 first, then fallback to PLAINTEXT if needed
    let oauth = getOAuthInstance("HMAC-SHA1");
    let response;
    let lastError;

    try {
      // Prepare request data for OAuth signing
      const requestData = {
        url: url,
        method: 'GET',
        data: params
      };

      // Generate OAuth authorization
      const token = {}; // No access token needed for public API endpoints
      const authData = oauth.authorize(requestData, token);
      const authHeader = oauth.toHeader(authData);

      // Debug logging
      console.log(`Making request to ${TRADEME_ENV} environment:`, url);
      console.log('With params:', params);
      console.log('Using signature method: HMAC-SHA1');

      // Make request with OAuth header
      response = await axios.get(url, {
        headers: {
          ...authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        params: params
      });
    } catch (hmacError) {
      // If HMAC-SHA1 fails with 401, try PLAINTEXT signature method
      if (hmacError.response && hmacError.response.status === 401) {
        console.log('HMAC-SHA1 failed, trying PLAINTEXT signature method...');
        lastError = hmacError;

        oauth = getOAuthInstance("PLAINTEXT");
        const requestData = {
          url: url,
          method: 'GET',
          data: params
        };

        const token = {};
        const authData = oauth.authorize(requestData, token);
        const authHeader = oauth.toHeader(authData);

        console.log('Retrying with PLAINTEXT signature method');

        response = await axios.get(url, {
          headers: {
            ...authHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          params: params
        });
      } else {
        throw hmacError;
      }
    }

    // Filter listings that have open homes and transform the data
    const listings = response.data.List || [];
    const openHomes = listings
      .filter(listing => listing.OpenHomes && listing.OpenHomes.length > 0)
      .map((listing, index) => ({
        id: listing.ListingId || index + 1,
        title: listing.Title,
        location: listing.Suburb || listing.District || 'Location not specified',
        bedrooms: listing.Bedrooms || 0,
        bathrooms: listing.Bathrooms || 0,
        openHomeTime: listing.OpenHomes[0].Start, // Use first open home time
        price: listing.PriceDisplay,
        // Include additional TradeMe data if needed
        listingId: listing.ListingId,
        pictureHref: listing.PictureHref
      }));

    return openHomes;
  } catch (error) {
    // Enhanced error logging with full response details
    if (error.response) {
      const errorDetails = {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        headers: error.response.headers
      };
      console.error('TradeMe API Error Details:', JSON.stringify(errorDetails, null, 2));

      // Include TradeMe's error message if available
      const errorMessage = error.response.data?.ErrorDescription ||
        error.response.data?.Message ||
        error.response.statusText;

      // Add helpful hint if it's an authentication error
      let fullErrorMessage = `TradeMe API error: ${error.response.status} - ${errorMessage}`;
      if (error.response.status === 401 && errorMessage.includes('consumer key')) {
        fullErrorMessage += `\n\nTip: Make sure TRADEME_ENV matches your credentials (sandbox or production).`;
        fullErrorMessage += `\nCurrent environment: ${TRADEME_ENV}`;
        fullErrorMessage += `\nCurrent API URL: ${TRADEME_API_BASE}`;
      }

      throw new Error(fullErrorMessage);
    } else if (error.request) {
      console.error('No response from TradeMe API:', error.message);
      throw new Error('Failed to connect to TradeMe API - no response received');
    } else {
      console.error('Error fetching from TradeMe API:', error.message);
      throw error;
    }
  }
}

// GET: list open homes
app.get("/api/open-homes", async (req, res) => {
  try {
    const openHomes = await fetchOpenHomes();
    res.json(openHomes);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch open homes from TradeMe API",
      error: error.message
    });
  }
});

// GET: single open home
// Note: This endpoint fetches all open homes to find one. Consider caching or
// using TradeMe's single listing endpoint for better performance
app.get("/api/open-homes/:id", async (req, res) => {
  try {
    const openHomes = await fetchOpenHomes();
    const id = Number(req.params.id);
    const home = openHomes.find((item) => item.id === id);

    if (!home) {
      return res.status(404).json({ message: "Home not found" });
    }
    res.json(home);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch open home from TradeMe API",
      error: error.message
    });
  }
});

// Start server
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});