// TOOL_REGISTRY — the Restaurant Tool Library's own registry, distinct from
// CAPABILITY_REGISTRY in ../tool-registry.ts (see tools/types.ts's header
// for why that file isn't renamed despite the mismatch). Every tool defined
// in tools/*.ts is listed here under its canonical name; a future
// capability's tools get added the same way — one entry each, no change to
// this file's shape or to getTool()/listToolsForCapability().

import * as menu from './menu';
import * as pricing from './pricing';
import * as promotion from './promotion';
import * as restaurant from './restaurant';
import * as conversation from './conversation';
import type { ToolDefinition } from './types';
import type { CapabilityKey } from '../tool-registry';

export const TOOL_REGISTRY: Record<string, ToolDefinition<any, any>> = {
  // Menu Tools
  searchMenus: menu.searchMenus,
  searchMenuCategories: menu.searchMenuCategories,
  searchMenuItems: menu.searchMenuItems,
  findItemsByName: menu.searchMenuItems, // same tool, both requested names
  getMenuItem: menu.getMenuItem,
  getMenuItemsByCategory: menu.getMenuItemsByCategory,
  getFeaturedItems: menu.getFeaturedItems,
  findItemsByTags: menu.findItemsByTags,

  // Promotion Tools
  createPromotionDraft: promotion.createPromotionDraft,
  previewPromotion: promotion.previewPromotion,
  applyPromotion: promotion.applyPromotion,
  cancelPromotion: promotion.cancelPromotion,
  // archivePromotion: not implemented — no 'archived' ProposalStatus exists.

  // Pricing Tools
  calculateDiscount: pricing.calculateDiscount,
  validateDiscount: pricing.validateDiscount,
  estimatePromotionImpact: pricing.estimatePromotionImpact,
  estimateRevenueImpact: pricing.estimatePromotionImpact, // same tool, same return shape
  estimateMargin: pricing.estimateMargin,
  detectConflictingPromotion: pricing.detectConflictingPromotion,

  // Restaurant Context Tools
  getRestaurant: restaurant.getRestaurant,
  validateOwnership: restaurant.validateOwnership,
  getRestaurantTimezone: restaurant.getRestaurantTimezone,
  getCapabilities: restaurant.getCapabilities,
  getRestaurantSettings: restaurant.getRestaurantSettings,

  // Conversation Tools
  getOpenProposal: conversation.getOpenProposal,
  getProposalHistory: conversation.getProposalHistory,
  getConversationContext: conversation.getConversationContext,
  getConversationSummary: conversation.getConversationSummary,

  // Validation Tools
  validateProposal: pricing.validateProposal,
  revalidateProposal: pricing.validateProposal, // same tool, both requested names
  validateCapability: restaurant.validateCapability,
  // validateRestaurantScope: not a separate tool — every query in this
  // library already filters by restaurant_id at the query level (stronger
  // than a separate checkable step, since there's no window where scope
  // could be skipped). See the architecture doc for the full reasoning.
};

export function getTool(name: string): ToolDefinition<any, any> | undefined {
  return TOOL_REGISTRY[name];
}

export function listToolsForCapability(capability: CapabilityKey): ToolDefinition<any, any>[] {
  return Object.values(TOOL_REGISTRY).filter((tool) => tool.capability === capability);
}
