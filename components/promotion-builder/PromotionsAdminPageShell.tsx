'use client';

import { CreatePromotionFlow } from '@/components/promotion-builder/CreatePromotionFlow';
import {
  getPromotionStatus,
  restaurantAddress,
  restaurantLocationLabel,
  usePromotionsAdmin,
  type Filter,
  type Promotion,
  type PromotionsAdminMode,
} from '@/hooks/usePromotionsAdmin';
import { getGameBadge } from '@/lib/games/game-registry';
import { UI_LAYERS } from '@/lib/ui-layers';

function filterLabel(filter: Filter) {
  return filter === 'all' ? 'All' : filter[0].toUpperCase() + filter.slice(1);
}

function formatDate(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : 'Not set';
}

function activeTabClass(active: boolean) {
  return active ? 'bg-[#1F1F1F] text-white shadow-xl' : 'bg-white text-stone-500 hover:bg-orange-50';
}

function promotionBadgeClass(status: Filter) {
  if (status === 'active') return 'bg-green-50 text-green-700';
  if (status === 'pending') return 'bg-yellow-50 text-yellow-700';
  if (status === 'ended') return 'bg-stone-100 text-stone-600';
  return 'bg-orange-50 text-[#FF6B00]';
}

function statusBadgeClass(status: string) {
  if (status === 'redeemed') return 'bg-green-50 text-green-700';
  if (status === 'expired') return 'bg-stone-100 text-stone-600';
  return 'bg-orange-50 text-[#FF6B00]';
}

function gameBadge(gameType?: string | null) {
  return getGameBadge(gameType);
}

function modeLabel(mode: PromotionsAdminMode, copy: any) {
  if (mode === 'create') return copy.create_tab_label;
  if (mode === 'drafts') return copy.drafts_tab_label || 'Drafts';
  return copy.manage_tab_label;
}

function modeHeadline(mode: PromotionsAdminMode, copy: any) {
  if (mode === 'create') return copy.create_headline;
  if (mode === 'drafts') return copy.drafts_headline || 'Continue building draft campaigns.';
  return copy.manage_headline;
}

function modeSubheadline(mode: PromotionsAdminMode, copy: any) {
  if (mode === 'create') return copy.create_subheadline;
  if (mode === 'drafts') return copy.drafts_subheadline || 'Drafts are promotions that have been created but not published yet.';
  return copy.manage_subheadline;
}

function PromotionCard({
  promotion,
  selectedRestaurantSlug,
  selectedRestaurantName,
  selectedRestaurantAddress,
  issued,
  redeemed,
  copied,
  deleting,
  ending,
  loadingPerformance,
  onLoadPerformance,
  onCopy,
  onDelete,
  onEnd,
}: {
  promotion: Promotion;
  selectedRestaurantSlug: string;
  selectedRestaurantName: string;
  selectedRestaurantAddress: string;
  issued: number;
  redeemed: number;
  copied: boolean;
  deleting: boolean;
  ending: boolean;
  loadingPerformance: boolean;
  onLoadPerformance: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onEnd: () => void;
}) {
  const status = getPromotionStatus(promotion);
  const game = gameBadge(promotion.game_type);
  const redemptionRate = issued ? Math.round((redeemed / issued) * 100) : 0;
  const playHref = `/play/${selectedRestaurantSlug}/${promotion.slug}`;

  return (
    <article className="rounded-3xl bg-white p-5 shadow-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-3xl font-black">{promotion.name}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className={`inline-block rounded-full px-3 py-1 text-xs font-black uppercase ${promotionBadgeClass(status)}`}>{status}</p>
            <p className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-xs font-black uppercase text-stone-700">
              <span>{game.icon}</span>
              <span>{game.label}</span>
            </p>
          </div>
        </div>
        <a href={`/admin/promotions/${promotion.id}/builder`} className="rounded-full bg-orange-50 px-4 py-2 text-center text-sm font-black text-[#FF6B00]">
          {status === 'draft' ? 'Build' : 'Edit'}
        </a>
      </div>

      <div className="mt-4 rounded-2xl bg-orange-50 p-4">
        <p className="text-xs font-black uppercase tracking-wide text-[#FF6B00]">Restaurant Location</p>
        <p className="mt-1 text-xl font-black">{selectedRestaurantName}</p>
        <p className="mt-1 text-sm font-bold text-stone-600">{selectedRestaurantAddress}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-stone-500">Promotion Start</p>
            <p className="mt-1 text-sm font-black text-stone-800">{formatDate(promotion.starts_at)}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-stone-500">Promotion Expiry</p>
            <p className="mt-1 text-sm font-black text-stone-800">{formatDate(promotion.ends_at)}</p>
          </div>
        </div>
      </div>

      {status !== 'draft' && (
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ['Issued', loadingPerformance ? '...' : issued],
            ['Redeemed', loadingPerformance ? '...' : redeemed],
            ['Rate', loadingPerformance ? '...' : `${redemptionRate}%`],
          ].map(([label, value]) => (
            <button key={label} onClick={onLoadPerformance} className="rounded-2xl bg-stone-50 p-3 text-[#1F1F1F] transition hover:bg-orange-50 active:scale-[0.98]">
              <p className="text-xl font-black">{value}</p>
              <p className="text-xs font-bold text-stone-500">{label}</p>
              <p className="mt-1 text-[10px] font-black uppercase text-[#FF6B00]">Details</p>
            </button>
          ))}
        </div>
      )}

      <p className="mt-4 break-all text-sm font-black text-[#FF6B00]">{playHref}</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={onCopy} className="rounded-2xl bg-[#1F1F1F] px-4 py-3 text-sm font-black text-white">{copied ? 'Copied!' : 'Copy Link'}</button>
        {status === 'active' && <a href={playHref} target="_blank" rel="noreferrer" className="rounded-2xl bg-[#FF6B00] px-4 py-3 text-center text-sm font-black text-white">Open Promotion</a>}
        <a href={`/admin/promotions/${promotion.id}/print`} target="_blank" className="rounded-2xl bg-green-600 px-4 py-3 text-center text-sm font-black text-white">Print Kit</a>
        {status === 'draft' ? (
          <button onClick={onDelete} disabled={deleting} className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600">{deleting ? 'Deleting...' : 'Delete Draft'}</button>
        ) : status === 'active' || status === 'pending' ? (
          <button onClick={onEnd} disabled={ending} className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600">{ending ? 'Ending...' : 'End Promotion'}</button>
        ) : (
          <span className="rounded-2xl bg-stone-100 px-4 py-3 text-center text-sm font-black text-stone-500">Promotion Ended</span>
        )}
      </div>
    </article>
  );
}

export function PromotionsAdminPageShell() {
  const admin = usePromotionsAdmin();
  const {
    copy,
    restaurants,
    selectedRestaurantId,
    setSelectedRestaurantId,
    selectedRestaurant,
    name,
    setName,
    gameType,
    setGameType,
    saving,
    canCreate,
    error,
    metricsError,
    performanceError,
    metricsInfo,
    mode,
    setMode,
    filter,
    setFilter,
    statusCounts,
    visiblePromotions,
    counts,
    countsBySlug,
    copiedId,
    deletingId,
    endingId,
    loadingPerformanceId,
    performance,
    setPerformance,
    actions,
  } = admin;

  const showPromotionList = mode === 'drafts' || mode === 'manage';

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
            <p className="mt-1 text-sm font-bold text-stone-500">{modeLabel(mode, copy)}</p>
          </div>
          <a href="/admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Dashboard</a>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">{copy.eyebrow}</p>
          <h2 className="mt-3 text-4xl font-black leading-tight">{modeHeadline(mode, copy)}</h2>
          <p className="mt-3 text-sm font-semibold text-white/85">{modeSubheadline(mode, copy)}</p>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 rounded-3xl bg-white p-2 shadow-xl">
          <button onClick={() => setMode('create')} className={`rounded-2xl px-3 py-3 text-xs font-black sm:text-sm ${activeTabClass(mode === 'create')}`}>{copy.create_tab_label}</button>
          <button onClick={() => setMode('drafts')} className={`rounded-2xl px-3 py-3 text-xs font-black sm:text-sm ${activeTabClass(mode === 'drafts')}`}>{copy.drafts_tab_label || 'Drafts'}<br />{statusCounts.draft}</button>
          <button onClick={() => setMode('manage')} className={`rounded-2xl px-3 py-3 text-xs font-black sm:text-sm ${activeTabClass(mode === 'manage')}`}>{copy.manage_tab_label}</button>
        </div>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
          <p className="text-sm font-black uppercase text-[#FF6B00]">{mode === 'create' ? copy.select_location_label : 'Restaurant Location'}</p>
          <select value={selectedRestaurantId} onChange={(event) => setSelectedRestaurantId(event.target.value)} className="mt-3 w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 font-black outline-none focus:border-[#FF6B00]">
            <option value="">Select restaurant/location...</option>
            {restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurantLocationLabel(restaurant)}</option>)}
          </select>
          {selectedRestaurant && (
            <div className="mt-4 rounded-2xl bg-orange-50 p-4">
              <p className="text-xl font-black">{selectedRestaurant.name}</p>
              <p className="mt-1 text-sm font-bold text-stone-600">{restaurantAddress(selectedRestaurant)}</p>
              <p className="mt-1 text-xs font-bold text-stone-500">/{selectedRestaurant.slug}</p>
            </div>
          )}
        </section>

        {mode === 'create' && (
          <CreatePromotionFlow
            promotionName={name}
            onPromotionNameChange={setName}
            gameType={gameType}
            onGameTypeChange={setGameType}
            saving={saving}
            canCreate={canCreate}
            onCreatePromotion={actions.createPromotion}
            nameLabel={copy.name_promotion_label}
            gameLabel={copy.select_game_label}
            createButtonLabel={copy.create_button_label}
          />
        )}

        {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
        {metricsError && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">Metrics error: {metricsError}</p>}
        {performanceError && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">Performance error: {performanceError}</p>}

        {showPromotionList && (
          <section className="mt-5 space-y-4">
            <div className="rounded-3xl bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase text-[#FF6B00]">{mode === 'drafts' ? 'Draft Promotions' : 'Managed Promotions'}</p>
                  <p className="mt-2 text-sm font-bold text-stone-500">
                    {mode === 'drafts'
                      ? 'Drafts are created promotions that are not published yet. Finish building them here.'
                      : 'Default view shows live active promotions. Pending campaigns have a future start time and are not playable yet.'}
                  </p>
                  {metricsInfo && <p className="mt-2 text-xs font-black text-stone-400">{metricsInfo}</p>}
                </div>
                {mode === 'manage' && <button onClick={actions.loadPromotionMetrics} className="rounded-full bg-stone-100 px-4 py-3 text-xs font-black text-stone-700">Refresh Metrics</button>}
              </div>

              {mode === 'manage' && (
                <div className="mt-4 grid grid-cols-4 gap-2 rounded-2xl bg-stone-50 p-2">
                  {(['active', 'pending', 'ended', 'all'] as Filter[]).map((item) => (
                    <button key={item} onClick={() => setFilter(item)} className={`rounded-xl px-2 py-3 text-xs font-black ${filter === item ? 'bg-[#1F1F1F] text-white shadow' : 'bg-white text-stone-600'}`}>{filterLabel(item)}<br />{statusCounts[item]}</button>
                  ))}
                </div>
              )}
            </div>

            {selectedRestaurant && visiblePromotions.length === 0 && (
              <div className="rounded-3xl bg-white p-6 shadow-xl">
                <p className="text-2xl font-black">{mode === 'drafts' ? copy.no_drafts_title : `No ${filter} promotions`}</p>
                <p className="mt-2 text-sm font-semibold text-stone-600">{mode === 'drafts' ? copy.no_drafts_copy : 'Switch filters to view other statuses.'}</p>
              </div>
            )}

            {selectedRestaurant && visiblePromotions.map((promotion) => {
              const metric = counts[promotion.id] || countsBySlug[promotion.slug] || { issued: 0, redeemed: 0 };
              return (
                <PromotionCard
                  key={promotion.id}
                  promotion={promotion}
                  selectedRestaurantSlug={selectedRestaurant.slug}
                  selectedRestaurantName={selectedRestaurant.name}
                  selectedRestaurantAddress={restaurantAddress(selectedRestaurant)}
                  issued={metric.issued}
                  redeemed={metric.redeemed}
                  copied={copiedId === promotion.id}
                  deleting={deletingId === promotion.id}
                  ending={endingId === promotion.id}
                  loadingPerformance={loadingPerformanceId === promotion.id}
                  onLoadPerformance={() => actions.loadPromotionPerformance(promotion.id)}
                  onCopy={() => actions.copyPlayLink(promotion)}
                  onDelete={() => actions.deletePromotion(promotion)}
                  onEnd={() => actions.endPromotion(promotion)}
                />
              );
            })}
          </section>
        )}
      </section>

      {performance && (
        <div style={{ zIndex: UI_LAYERS.modal }} className="fixed inset-0 flex items-end justify-center bg-black/40 px-3 py-4 sm:items-center">
          <section className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#FF6B00]">Promotion Performance</p>
                <h2 className="mt-1 text-3xl font-black">{performance.promotion.name}</h2>
                <p className="mt-1 text-sm font-bold text-stone-500">{performance.restaurant.name} — {performance.restaurant.address || 'Address not added'}</p>
              </div>
              <button onClick={() => setPerformance(null)} className="rounded-full bg-stone-100 px-4 py-3 text-sm font-black text-stone-700">Close</button>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-2 text-center">
              {[
                ['Issued', performance.summary.issued],
                ['Redeemed', performance.summary.redeemed],
                ['Active', performance.summary.active],
                ['Expired', performance.summary.expired],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-orange-50 p-3">
                  <p className="text-2xl font-black">{value}</p>
                  <p className="text-xs font-bold text-stone-500">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-3xl bg-[#1F1F1F] p-4 text-white">
              <p className="text-sm font-black uppercase tracking-wide text-white/60">Redemption Rate</p>
              <p className="mt-1 text-4xl font-black">{performance.summary.redemptionRate}%</p>
              <p className="mt-1 text-sm font-bold text-white/60">Coupons expire after {performance.promotion.coupon_expiry_minutes} minutes.</p>
            </div>
            <div className="mt-4 rounded-3xl bg-orange-50 p-4">
              <p className="text-sm font-black uppercase text-[#FF6B00]">Coupon Ledger</p>
              <div className="mt-3 space-y-3">
                {performance.coupons.length === 0 && <p className="text-sm font-bold text-stone-500">No issued coupons yet.</p>}
                {performance.coupons.map((coupon) => (
                  <article key={coupon.id} className="rounded-2xl bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-black">{coupon.coupon_code || 'No code'}</p>
                        <p className="text-sm font-bold text-stone-500">{coupon.item_won} — {coupon.discount_type}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${statusBadgeClass(coupon.display_status)}`}>{coupon.display_status}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
