const supabase = require('../config/supabase');

// Save open homes to Supabase
async function saveOpenHomesToDB(openHomes) {
    try {
        // Transform data to match database schema
        const homesToSave = openHomes.map(home => ({
            listing_id: home.listingId?.toString() || home.id?.toString(),
            title: home.title,
            location: home.location,
            bedrooms: home.bedrooms || 0,
            bathrooms: home.bathrooms || 0,
            open_home_time: home.openHomeTime ? new Date(home.openHomeTime) : null,
            price: home.price,
            picture_href: home.pictureHref
        }));

        // Upsert (insert or update) based on listing_id
        const { data, error } = await supabase
            .from('open_homes')
            .upsert(homesToSave, { onConflict: 'listing_id' });

        if (error) {
            console.error('Error saving to Supabase:', error);
            throw error;
        }

        console.log(`Saved ${homesToSave.length} open homes to Supabase`);
        return data;
    } catch (error) {
        console.error('Failed to save open homes to Supabase:', error.message);
        throw error;
    }
}

// Fetch open homes from Supabase
async function getOpenHomesFromDB() {
    try {
        const { data, error } = await supabase
            .from('open_homes')
            .select('*')
            .order('open_home_time', { ascending: true });

        if (error) {
            console.error('Error fetching from Supabase:', error);
            throw error;
        }

        // Transform back to match your API response format
        return data.map(home => ({
            id: home.id,
            listingId: home.listing_id,
            title: home.title,
            location: home.location,
            bedrooms: home.bedrooms,
            bathrooms: home.bathrooms,
            openHomeTime: home.open_home_time,
            price: home.price,
            pictureHref: home.picture_href
        }));
    } catch (error) {
        console.error('Failed to fetch open homes from Supabase:', error.message);
        throw error;
    }
}

// Get a single open home by listing_id
async function getOpenHomeById(listingId) {
    try {
        const { data, error } = await supabase
            .from('open_homes')
            .select('*')
            .eq('listing_id', listingId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No rows returned
                return null;
            }
            throw error;
        }

        // Transform to match API response format
        return {
            id: data.id,
            listingId: data.listing_id,
            title: data.title,
            location: data.location,
            bedrooms: data.bedrooms,
            bathrooms: data.bathrooms,
            openHomeTime: data.open_home_time,
            price: data.price,
            pictureHref: data.picture_href
        };
    } catch (error) {
        console.error('Failed to fetch open home from Supabase:', error.message);
        throw error;
    }
}

module.exports = {
    saveOpenHomesToDB,
    getOpenHomesFromDB,
    getOpenHomeById
};