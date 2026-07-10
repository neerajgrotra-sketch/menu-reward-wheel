import { describe, it, expect } from 'vitest';
import { findGoalCategory, buildCategorySalesOpportunity, buildPromotionEngagementOpportunity } from './category-coverage-goals';
import type { CategorySales, PromotionCoverage } from '../../tools/analytics';

const CATEGORIES = [
  { id: 'cat-desserts', name: 'Desserts' },
  { id: 'cat-beverages', name: 'Beverages' },
  { id: 'cat-mains', name: 'Main Course' },
];

function sales(overrides: Partial<CategorySales>[]): CategorySales[] {
  return overrides.map((o, i) => ({ categoryId: `cat-${i}`, categoryName: `Category ${i}`, revenue: 0, quantity: 0, ...o }));
}

describe('findGoalCategory', () => {
  it('matches "Desserts" for increase_dessert_sales', () => {
    expect(findGoalCategory('increase_dessert_sales', CATEGORIES)?.name).toBe('Desserts');
  });

  it('matches "Beverages" for increase_beverage_sales', () => {
    expect(findGoalCategory('increase_beverage_sales', CATEGORIES)?.name).toBe('Beverages');
  });

  it('also matches a "Drinks" category by the drink keyword', () => {
    expect(findGoalCategory('increase_beverage_sales', [{ id: 'c1', name: 'Drinks' }])?.name).toBe('Drinks');
  });

  it('returns null rather than guessing when nothing matches', () => {
    expect(findGoalCategory('increase_dessert_sales', [{ id: 'c1', name: 'Appetizers' }])).toBeNull();
  });
});

describe('buildCategorySalesOpportunity', () => {
  const category = { id: 'cat-desserts', name: 'Desserts' };
  const noneCoverage: PromotionCoverage = { campaignCoverage: 'none', itemCoverage: 'none' };
  const staleCoverage: PromotionCoverage = { campaignCoverage: 'none', itemCoverage: 'stale' };
  const activeCoverage: PromotionCoverage = { campaignCoverage: 'none', itemCoverage: 'active' };

  it('suppresses the opportunity when an active item-level special already covers the category', () => {
    const result = buildCategorySalesOpportunity({
      goal: 'increase_dessert_sales',
      category,
      categorySales: [],
      coverage: activeCoverage,
      confidenceCap: null,
    });
    expect(result).toBeNull();
  });

  it('is high confidence when there is no coverage at all', () => {
    const result = buildCategorySalesOpportunity({ goal: 'increase_dessert_sales', category, categorySales: [], coverage: noneCoverage, confidenceCap: null });
    expect(result?.confidence).toBe('high');
    expect(result?.observation).toContain('No active discount or promotion exists');
  });

  it('is medium confidence — never high — when coverage exists but has expired', () => {
    const result = buildCategorySalesOpportunity({ goal: 'increase_dessert_sales', category, categorySales: [], coverage: staleCoverage, confidenceCap: null });
    expect(result?.confidence).toBe('medium');
    expect(result?.observation).toContain('expired');
  });

  it('caps confidence down for thin order history, never up', () => {
    const result = buildCategorySalesOpportunity({ goal: 'increase_dessert_sales', category, categorySales: [], coverage: noneCoverage, confidenceCap: 'low' });
    expect(result?.confidence).toBe('low');
  });

  it('produces a real, executable category-scope MenuDiscountAction — never a fabricated "bundle" or "feature" action', () => {
    const result = buildCategorySalesOpportunity({ goal: 'increase_dessert_sales', category, categorySales: [], coverage: noneCoverage, confidenceCap: null });
    expect(result?.action).toEqual({
      type: 'set_discount',
      target: { scope: 'category', name: 'Desserts' },
      discount: { discountType: 'percentage', value: 15 },
    });
    expect(result?.requiredCapability).toBe('menu_pricing');
  });

  it('never claims a special property of QR/promotion-banner visibility — states it plainly as shared with every promotion', () => {
    const result = buildCategorySalesOpportunity({ goal: 'increase_dessert_sales', category, categorySales: [], coverage: noneCoverage, confidenceCap: null });
    expect(result?.reasoning).toContain('the same as any active promotion');
  });
});

describe('buildPromotionEngagementOpportunity', () => {
  it('is suppressed when any item-level coverage already exists — this goal is answer-only in that case', () => {
    const result = buildPromotionEngagementOpportunity({
      categorySales: sales([{ revenue: 100 }]),
      restaurantWideCoverage: { campaignCoverage: 'none', itemCoverage: 'active' },
      confidenceCap: null,
    });
    expect(result).toBeNull();
  });

  it('recommends the top-revenue category when there is truly zero coverage anywhere', () => {
    const result = buildPromotionEngagementOpportunity({
      categorySales: [
        { categoryId: 'c1', categoryName: 'Low', revenue: 10, quantity: 1 },
        { categoryId: 'c2', categoryName: 'High', revenue: 500, quantity: 10 },
      ],
      restaurantWideCoverage: { campaignCoverage: 'none', itemCoverage: 'none' },
      confidenceCap: null,
    });
    expect(result?.action).toMatchObject({ target: { scope: 'category', name: 'High' } });
    expect(result?.confidence).toBe('medium');
  });

  it('returns null when there is no sales data to pick a starting category from', () => {
    const result = buildPromotionEngagementOpportunity({
      categorySales: [],
      restaurantWideCoverage: { campaignCoverage: 'none', itemCoverage: 'none' },
      confidenceCap: null,
    });
    expect(result).toBeNull();
  });
});
