/**
 * Content seed script — Punjabi By Nature
 *
 * Mirrors exactly what the admin UI writes to the database.
 * Run once after confirming the restaurant row exists:
 *
 *   SUPABASE_URL=https://... SUPABASE_SERVICE_KEY=... npx tsx scripts/seed-punjabi-by-nature.ts
 *
 * The script is idempotent: it skips menus and items that already exist by name.
 */

import { createClient } from '@supabase/supabase-js';

const RESTAURANT_SLUG = 'punjabi-by-nature';

const supabase = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ── Menu sections ─────────────────────────────────────────────────────────────

const MENUS: Array<{ name: string; display_order: number }> = [
  { name: 'Breakfast', display_order: 10 },
  { name: 'Lunch',     display_order: 20 },
  { name: 'Dinner',    display_order: 30 },
  { name: 'Kids',      display_order: 40 },
];

// ── Menu items ────────────────────────────────────────────────────────────────

type SeedItem = {
  name: string;
  price: number | null;
  description: string;
  tags: string[];
  is_featured: boolean;
  display_order: number;
};

const ITEMS: Record<string, SeedItem[]> = {
  Breakfast: [
    {
      name: 'Lassi',
      price: 4.99,
      description: 'Classic Punjabi yogurt drink blended with ice and a hint of cardamom. Available sweet or salted.',
      tags: ['Vegetarian', 'Gluten Free', 'Refreshing'],
      is_featured: true,
      display_order: 10,
    },
    {
      name: 'Pakora',
      price: 8.99,
      description: 'Crispy gram-flour fritters loaded with onion, spinach, and green chilli. Served with mint chutney.',
      tags: ['Vegetarian', 'Vegan', 'Spicy'],
      is_featured: false,
      display_order: 20,
    },
    {
      name: 'Masala Chai',
      price: 3.49,
      description: 'Slow-brewed black tea with ginger, cardamom, cinnamon, and clove. Served with steamed milk.',
      tags: ['Vegetarian', 'Gluten Free', 'Hot Drink'],
      is_featured: false,
      display_order: 30,
    },
  ],
  Lunch: [
    {
      name: 'Tandoori Chicken',
      price: 16.99,
      description: 'Half chicken marinated overnight in yogurt, ginger-garlic, and house spice blend. Char-finished in a clay tandoor oven.',
      tags: ['Non-Veg', 'Gluten Free', 'Smoky'],
      is_featured: true,
      display_order: 10,
    },
    {
      name: 'Haryali Chicken',
      price: 17.99,
      description: 'Chicken tikka in a vibrant green marinade of coriander, mint, and spinach. A refreshing, herby take on the tandoor classic.',
      tags: ['Non-Veg', 'Gluten Free', 'Herb'],
      is_featured: false,
      display_order: 20,
    },
    {
      name: 'Naan Kabab',
      price: 13.99,
      description: 'Seekh kabab wrapped in fresh-baked naan with caramelised onions, chutney, and house raita.',
      tags: ['Non-Veg', 'Street Food'],
      is_featured: true,
      display_order: 30,
    },
  ],
  Dinner: [
    {
      name: 'Palak Paneer',
      price: 15.99,
      description: 'Fresh cottage cheese cubes in a silky spinach gravy tempered with cumin and garlic. Rich, earthy, and utterly satisfying.',
      tags: ['Vegetarian', 'Gluten Free'],
      is_featured: true,
      display_order: 10,
    },
    {
      name: 'Kadhi',
      price: 13.99,
      description: 'Tangy yogurt-based curry with gram-flour pakoras simmered until soft. Finished with a mustard-seed and dried-chilli tarka.',
      tags: ['Vegetarian', 'Comfort Food'],
      is_featured: false,
      display_order: 20,
    },
    {
      name: 'Sheesh Kabab',
      price: 18.99,
      description: 'Minced lamb skewers with aromatic spices, grilled over charcoal and served on a bed of saffron rice.',
      tags: ['Non-Veg', 'Gluten Free', 'Smoky'],
      is_featured: true,
      display_order: 30,
    },
  ],
  Kids: [
    {
      name: 'Chocolate Pizza',
      price: 6.99,
      description: 'Mini pizza base with chocolate hazelnut spread, sliced banana, and sprinkles. A sweet treat kids love.',
      tags: ['Vegetarian', 'Sweet', 'Kids Favourite'],
      is_featured: false,
      display_order: 10,
    },
    {
      name: 'Mini Idlis',
      price: 5.99,
      description: 'Bite-sized steamed rice cakes served with mild sambar and a gentle coconut chutney. Light and easy for little appetites.',
      tags: ['Vegetarian', 'Vegan', 'Gluten Free', 'Kids Favourite'],
      is_featured: false,
      display_order: 20,
    },
  ],
};

// ── Restaurant profile ────────────────────────────────────────────────────────

const RESTAURANT_PROFILE = {
  description:
    'Punjabi By Nature brings the bold, joyful flavours of the Punjab to your table. ' +
    'From tandoor-fired classics to slow-cooked curries, every dish is made from scratch ' +
    'using family recipes and the freshest ingredients. Dine in, take out, or play to win.',
  website_url:     'https://www.punjabirestaurant.ca',
  instagram_url:   'https://instagram.com/punjahibynature',
  facebook_url:    'https://facebook.com/punjahibynature',
  google_maps_url: 'https://maps.google.com/?q=Punjabi+By+Nature',
};

// ── Runner ────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n🌱 Seeding Punjabi By Nature — slug: ${RESTAURANT_SLUG}\n`);

  // 1. Find the restaurant
  const { data: restaurant, error: rErr } = await supabase
    .from('restaurants')
    .select('id,name,owner_id')
    .eq('slug', RESTAURANT_SLUG)
    .single();

  if (rErr || !restaurant) {
    console.error('❌ Restaurant not found:', rErr?.message ?? 'no row');
    process.exit(1);
  }
  console.log(`✓ Restaurant: ${restaurant.name} (${restaurant.id})\n`);

  // 2. Update restaurant profile
  const { error: profileErr } = await supabase
    .from('restaurants')
    .update({
      description:     RESTAURANT_PROFILE.description,
      website_url:     RESTAURANT_PROFILE.website_url,
      instagram_url:   RESTAURANT_PROFILE.instagram_url,
      facebook_url:    RESTAURANT_PROFILE.facebook_url,
      google_maps_url: RESTAURANT_PROFILE.google_maps_url,
      experience_mode: 'menu_and_promotion',
    })
    .eq('id', restaurant.id);

  if (profileErr) { console.error('❌ Profile update failed:', profileErr.message); process.exit(1); }
  console.log('✓ Restaurant profile updated\n');

  // 3. Upsert menus
  const menuIdByName: Record<string, string> = {};

  for (const menuDef of MENUS) {
    const { data: existing } = await supabase
      .from('menus')
      .select('id')
      .eq('restaurant_id', restaurant.id)
      .eq('name', menuDef.name)
      .maybeSingle();

    if (existing) {
      menuIdByName[menuDef.name] = existing.id;
      console.log(`  ↩ Menu exists: ${menuDef.name} (${existing.id})`);
      continue;
    }

    const slug = menuDef.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const { data: created, error: menuErr } = await supabase
      .from('menus')
      .insert({
        restaurant_id: restaurant.id,
        name:          menuDef.name,
        menu_type:     menuDef.name.toLowerCase(),
        slug,
        display_order: menuDef.display_order,
      })
      .select('id')
      .single();

    if (menuErr || !created) {
      console.error(`❌ Failed to create menu "${menuDef.name}":`, menuErr?.message);
      process.exit(1);
    }
    menuIdByName[menuDef.name] = created.id;
    console.log(`  ✓ Menu created: ${menuDef.name} (${created.id})`);
  }

  console.log('');

  // 4. Upsert items
  for (const [menuName, items] of Object.entries(ITEMS)) {
    const menuId = menuIdByName[menuName];
    if (!menuId) { console.warn(`  ⚠ No menu id for "${menuName}", skipping items`); continue; }

    for (const item of items) {
      const { data: existing } = await supabase
        .from('menu_items')
        .select('id')
        .eq('restaurant_id', restaurant.id)
        .eq('menu_id', menuId)
        .eq('name', item.name)
        .maybeSingle();

      if (existing) {
        // Update existing item with rich content (idempotent)
        await supabase
          .from('menu_items')
          .update({
            price:         item.price,
            description:   item.description,
            tags:          item.tags,
            is_featured:   item.is_featured,
            display_order: item.display_order,
            available:     true,
          })
          .eq('id', existing.id);
        console.log(`  ↩ Updated:  [${menuName}] ${item.name}`);
        continue;
      }

      const { error: itemErr } = await supabase
        .from('menu_items')
        .insert({
          restaurant_id: restaurant.id,
          menu_id:       menuId,
          name:          item.name,
          price:         item.price,
          description:   item.description,
          tags:          item.tags,
          is_featured:   item.is_featured,
          display_order: item.display_order,
          available:     true,
        });

      if (itemErr) {
        console.error(`  ❌ Failed to insert "${item.name}":`, itemErr.message);
      } else {
        console.log(`  ✓ Created:  [${menuName}] ${item.name}`);
      }
    }
  }

  console.log('\n✅ Seed complete.\n');
  console.log('Next steps:');
  console.log('  1. Upload hero photo via /admin/restaurants → Profile tab → Hero image');
  console.log('  2. Upload item photos via /admin/menu → Edit Section → Edit item → Image');
  console.log('  3. Preview at /r/punjabi-by-nature');
}

run().catch((e) => { console.error(e); process.exit(1); });
