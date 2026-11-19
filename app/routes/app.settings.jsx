import { useState } from "react";
import { useLoaderData, useFetcher, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  loadSettings,
  saveSettings,
  syncDiscounts,
  listDiscounts,
} from "../discount-sync.server";
import { SLOT_DEFS } from "../slot-defs";

const BADGE_STYLES = [
  { value: "pill", label: "Pill" },
  { value: "rounded", label: "Rounded" },
  { value: "square", label: "Square" },
];

const BADGE_SIZES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const PRICE_ORDER = [
  { value: "sale", label: "Sale price first" },
  { value: "original", label: "Original price first" },
];

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const [settings, discounts] = await Promise.all([
    loadSettings(admin),
    listDiscounts(admin),
  ]);
  return { settings, discounts };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const f = await request.formData();
  const readSelectors = (name) =>
    f
      .getAll(name)
      .map((selector) => String(selector).trim())
      .filter(Boolean);

  const cardSelectors = readSelectors("cardSelectors");
  const productSelectors = readSelectors("productSelectors");
  const landingSelectors = readSelectors("landingSelectors");
  const landingBadgeSelectors = readSelectors("landingBadgeSelectors");
  const widgetOneTimeSelectors = readSelectors("widgetOneTimeSelectors");
  const ctaSelectors = readSelectors("ctaSelectors");
  const ctaBadgeSelectors = readSelectors("ctaBadgeSelectors");
  const globalSelectors = readSelectors("globalSelectors");
  const showOnLandingPages = f.get("showOnLandingPages") === "on";

  if (cardSelectors.length === 0 || productSelectors.length === 0) {
    return {
      ok: false,
      error:
        "Add at least one CSS selector for product cards and product pages.",
    };
  }
  if (showOnLandingPages && landingSelectors.length === 0) {
    return {
      ok: false,
      error:
        "Add at least one landing-page selector, or turn off landing pages.",
    };
  }

  const discountId = String(f.get("discountId") || "").trim();
  const subPctRaw = String(f.get("subPctFallback") || "").trim();
  const subPctFallback = subPctRaw === "" ? null : Number(subPctRaw);
  if (subPctFallback !== null && !(subPctFallback > 0 && subPctFallback <= 100)) {
    return {
      ok: false,
      error: "Subscribe % fallback must be a number between 1 and 100, or blank.",
    };
  }
  const sellingPlanGroupId = String(f.get("sellingPlanGroupId") || "").trim();

  // Per-place display settings. A place that does not render its own
  // controls (badge-only places have no price order or colours) falls back
  // to the global badge / price settings above.
  const globalSaleColor = String(f.get("saleColor") || "#d82c0d");
  const globalBadgeBg = String(f.get("badgeBg") || "#42572A");
  const globalBadgeColor = String(f.get("badgeColor") || "#ffffff");
  const globalBadgeStyle = String(f.get("badgeStyle") || "pill");
  const globalBadgeSize = String(f.get("badgeSize") || "medium");
  const slots = {};
  for (const def of SLOT_DEFS) {
    const id = def.id;
    slots[id] = {
      originalFirst: f.get(`slot_${id}_originalFirst`) === "original",
      showBadge: f.get(`slot_${id}_showBadge`) === "on",
      saleColor: String(
        f.get(`slot_${id}_saleColor`) || globalSaleColor,
      ),
      badgeBg: String(f.get(`slot_${id}_badgeBg`) || globalBadgeBg),
      badgeColor: String(
        f.get(`slot_${id}_badgeColor`) || globalBadgeColor,
      ),
      badgeStyle: String(
        f.get(`slot_${id}_badgeStyle`) || globalBadgeStyle,
      ),
      badgeSize: String(f.get(`slot_${id}_badgeSize`) || globalBadgeSize),
    };
  }

  const settings = {
    enabled: f.get("enabled") === "on",
    showOnCards: f.get("showOnCards") === "on",
    showOnProductPage: f.get("showOnProductPage") === "on",
    showOnLandingPages,
    saleColor: globalSaleColor,
    originalFirst: f.get("originalFirst") === "original",
    cardSelectors,
    productSelectors,
    landingSelectors,
    landingBadgeSelectors:
      landingBadgeSelectors.length > 0 ? landingBadgeSelectors : [".burst"],
    widgetOneTimeSelectors,
    ctaSelectors,
    ctaBadgeSelectors,
    globalSelectors,
    slots,
    discountId: discountId || null,
    discountTitle: String(f.get("discountTitle") || ""),
    badgeEnabled: f.get("badgeEnabled") === "on",
    badgeStyle: globalBadgeStyle,
    badgeSize: globalBadgeSize,
    badgeBg: globalBadgeBg,
    badgeColor: globalBadgeColor,
    sellingPlanGroupId:
      sellingPlanGroupId || "gid://shopify/SellingPlanGroup/3389751513",
    subPctFallback,
    customCss: String(f.get("customCss") || "").slice(0, 20000),
  };
  await saveSettings(admin, settings);

  try {
    const result = await syncDiscounts(admin, settings);
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      settingsSaved: true,
      error:
        error instanceof Error
          ? error.message
          : "Settings were saved, but Shopify discount sync failed.",
    };
  }
};

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

const helpStyle = { margin: "0 0 12px", color: "#616161", fontSize: 14 };
const fieldHelpStyle = {
  display: "block",
  marginTop: 3,
  color: "#616161",
  fontSize: 14,
};
const colorInputStyle = {
  width: 48,
  height: 40,
  padding: 2,
  border: "1px solid #8c9196",
  borderRadius: 8,
};

function Help({ children }) {
  return <p style={helpStyle}>{children}</p>;
}

export default function Settings() {
  const { settings, discounts } = useLoaderData();
  const fetcher = useFetcher();
  const saving = fetcher.state !== "idle";
  const [customCss, setCustomCss] = useState(settings.customCss || "");
  const [selectedDiscountId, setSelectedDiscountId] = useState(
    settings.discountId || "",
  );
  const [badgeEnabled, setBadgeEnabled] = useState(
    settings.badgeEnabled !== false,
  );
  const [badgeStyle, setBadgeStyle] = useState(settings.badgeStyle);
  const [badgeSize, setBadgeSize] = useState(settings.badgeSize);
  const [badgeBg, setBadgeBg] = useState(settings.badgeBg);
  const [badgeColor, setBadgeColor] = useState(settings.badgeColor);
  const [saleColor, setSaleColor] = useState(settings.saleColor);
  const [originalFirst, setOriginalFirst] = useState(
    settings.originalFirst === true ? "original" : "sale",
  );

  const [slots, setSlots] = useState(() => {
    const out = {};
    for (const def of SLOT_DEFS) {
      const saved = (settings.slots || {})[def.id] || {};
      out[def.id] = {
        selectors: settings[def.selectorKey] || def.defaultSelectors,
        originalFirst: saved.originalFirst === true,
        showBadge: saved.showBadge !== false,
        saleColor: saved.saleColor || settings.saleColor,
        badgeBg: saved.badgeBg || settings.badgeBg,
        badgeColor: saved.badgeColor || settings.badgeColor,
        badgeStyle: saved.badgeStyle || settings.badgeStyle,
        badgeSize: saved.badgeSize || settings.badgeSize,
      };
    }
    return out;
  });

  const updateSlot = (id, patch) => {
    setSlots((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  };

  const selectedDiscount = discounts.find((d) => d.id === selectedDiscountId);
  const savedDiscountMissing =
    settings.discountId &&
    !discounts.some((d) => d.id === settings.discountId);

  const updateSelector = (setSelectors, index, value) => {
    setSelectors((current) =>
      current.map((selector, selectorIndex) =>
        selectorIndex === index ? value : selector,
      ),
    );
  };

  const renderSelectors = (
    label,
    name,
    selectors,
    setSelectors,
    placeholder,
    help,
    allowEmpty = false,
  ) => (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 6px", fontSize: 15 }}>{label}</h4>
      <p style={helpStyle}>{help}</p>
      <div style={{ display: "grid", gap: 10 }}>
        {selectors.map((selector, index) => (
          <div
            key={`${name}-${index}`}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <input
              id={`${name}-${index}`}
              aria-label={`${label} selector ${index + 1}`}
              name={name}
              value={selector}
              onChange={(event) =>
                updateSelector(setSelectors, index, event.target.value)
              }
              placeholder={placeholder}
              style={{
                boxSizing: "border-box",
                flex: 1,
                minWidth: 0,
                padding: "10px 12px",
                border: "1px solid #8c9196",
                borderRadius: 8,
                font: "inherit",
              }}
            />
            <button
              type="button"
              onClick={() =>
                setSelectors((current) =>
                  current.filter((_, selectorIndex) => selectorIndex !== index),
                )
              }
              disabled={!allowEmpty && selectors.length === 1}
              aria-label={`Remove ${label.toLowerCase()} selector ${index + 1}`}
              style={{
                padding: "8px 10px",
                border: "1px solid #c9cccf",
                borderRadius: 8,
                background: "white",
                cursor:
                  !allowEmpty && selectors.length === 1
                    ? "not-allowed"
                    : "pointer",
                opacity: !allowEmpty && selectors.length === 1 ? 0.5 : 1,
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setSelectors((current) => [...current, ""])}
        style={{
          marginTop: 10,
          padding: "8px 12px",
          border: "1px solid #8c9196",
          borderRadius: 8,
          background: "white",
          cursor: "pointer",
        }}
      >
        Add selector
      </button>
    </div>
  );

  const renderChoiceRow = (name, options, value, onChange, label, help) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {help && <p style={helpStyle}>{help}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map((option) => (
          <label
            key={option.value}
            style={{
              padding: "8px 14px",
              border:
                value === option.value
                  ? "2px solid #008060"
                  : "1px solid #8c9196",
              borderRadius: 999,
              cursor: "pointer",
              background: value === option.value ? "#eaf7ed" : "white",
              fontWeight: value === option.value ? 700 : 400,
            }}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );

  const renderCheckbox = (id, name, checked, onChange, label, help) => (
    <div
      style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}
    >
      <input
        id={id}
        aria-label={label}
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <strong>{label}</strong>
        <span style={fieldHelpStyle}>{help}</span>
      </span>
    </div>
  );

  const renderColorField = (name, value, onChange, label, help) => (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 16,
      }}
    >
      <span style={{ minWidth: 140 }}>
        <strong>{label}</strong>
        <span style={fieldHelpStyle}>{help}</span>
      </span>
      <input
        type="color"
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        style={colorInputStyle}
      />
      <span style={{ color: "#616161", fontSize: 14 }}>{value}</span>
    </label>
  );

  const renderSlotCard = (def) => {
    const slot = slots[def.id];
    const setSelectors = (updater) =>
      updateSlot(def.id, {
        selectors:
          typeof updater === "function" ? updater(slot.selectors) : updater,
      });
    const isBadgeOnly = def.kind === "badge";
    return (
      <div
        key={def.id}
        style={{
          marginBottom: 16,
          padding: 16,
          border: "1px solid #c9cccf",
          borderRadius: 12,
          background: "white",
        }}
      >
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>{def.label}</h3>
        <p style={helpStyle}>{def.help}</p>
        {renderSelectors(
          "CSS selectors",
          def.selectorKey,
          slot.selectors,
          setSelectors,
          def.defaultSelectors[0] || ".price",
          def.kind === "static"
            ? "Every selector is checked on the page. The price found inside the matching element's text is rewritten — the rest of the text stays as it is."
            : def.kind === "badge"
              ? "Every selector is checked on the page. Only the % number inside the matching badge is rewritten."
              : "Every selector is checked on the page. Matching elements are rewritten to the sale price, struck original and badge below.",
          def.kind !== "price" || def.id === "landing",
        )}
        {isBadgeOnly ? (
          <>
            {renderCheckbox(
              `slot-${def.id}-show-badge`,
              `slot_${def.id}_showBadge`,
              slot.showBadge,
              (checked) => updateSlot(def.id, { showBadge: checked }),
              "Rewrite the % in this badge",
              "Turn off to leave the badge exactly as the theme renders it (for example while a sale is being reworded). The badge shape and colours always stay the theme's — this app only ever changes the number.",
            )}
            <p style={{ ...helpStyle, marginBottom: 0 }}>
              Price order and colours do not apply here: there is no price to
              order, and the badge keeps the theme's own look.
            </p>
          </>
        ) : (
          <>
            {renderChoiceRow(
              `slot_${def.id}_originalFirst`,
              PRICE_ORDER,
              slot.originalFirst ? "original" : "sale",
              (value) =>
                updateSlot(def.id, { originalFirst: value === "original" }),
              "Original price position",
              "Sale price first matches how Appstle shows its Subscribe row (sale, struck original, badge). Original first shows the struck price before the sale price.",
            )}
            {renderCheckbox(
              `slot-${def.id}-show-badge`,
              `slot_${def.id}_showBadge`,
              slot.showBadge,
              (checked) => updateSlot(def.id, { showBadge: checked }),
              "Show a “Save %” badge",
              "The percentage is worked out from the original and sale prices — it is never typed in by hand.",
            )}
            {renderColorField(
              `slot_${def.id}_saleColor`,
              slot.saleColor,
              (value) => updateSlot(def.id, { saleColor: value }),
              "Sale price colour",
              "The colour of the discounted price in this place.",
            )}
            {renderColorField(
              `slot_${def.id}_badgeBg`,
              slot.badgeBg,
              (value) => updateSlot(def.id, { badgeBg: value }),
              "Badge background",
              "The badge fill colour in this place. The default matches Appstle's badge.",
            )}
            {renderColorField(
              `slot_${def.id}_badgeColor`,
              slot.badgeColor,
              (value) => updateSlot(def.id, { badgeColor: value }),
              "Badge text",
              "The badge text colour in this place.",
            )}
            {renderChoiceRow(
              `slot_${def.id}_badgeStyle`,
              BADGE_STYLES,
              slot.badgeStyle,
              (value) => updateSlot(def.id, { badgeStyle: value }),
              "Badge shape",
              "Pill matches Appstle's badge shape.",
            )}
            {renderChoiceRow(
              `slot_${def.id}_badgeSize`,
              BADGE_SIZES,
              slot.badgeSize,
              (value) => updateSlot(def.id, { badgeSize: value }),
              "Badge size",
              "Medium matches the size of Appstle's badge on the product page.",
            )}
          </>
        )}
      </div>
    );
  };

  const badgeRadius =
    badgeStyle === "pill" ? 999 : badgeStyle === "rounded" ? 6 : 2;
  const badgeFontSize =
    badgeSize === "small" ? "0.62rem" : badgeSize === "large" ? "0.85rem" : "0.72rem";
  const badgePadding =
    badgeSize === "small"
      ? "1px 6px"
      : badgeSize === "large"
        ? "4px 10px"
        : "2px 8px";
  const previewSale = (
    <span style={{ fontWeight: 600, color: saleColor }}>$50.97</span>
  );
  const previewOrig = (
    <span style={{ opacity: 0.6 }}>
      <s>$59.97</s>
    </span>
  );
  const previewBadge = badgeEnabled ? (
    <span
      style={{
        display: "inline-block",
        padding: badgePadding,
        borderRadius: badgeRadius,
        background: badgeBg,
        color: badgeColor,
        fontSize: badgeFontSize,
        fontWeight: 800,
        letterSpacing: ".04em",
        verticalAlign: "2px",
      }}
    >
      Save 15%
    </span>
  ) : null;

  return (
    <s-page heading="Discount price settings">
      <div
        style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 40px" }}
      >
        <p style={{ margin: "0 0 20px", color: "#616161", lineHeight: 1.5 }}>
          Choose which discount to show, how the sale price and badge look,
          and where on your storefront they appear. Every place below has its
          own settings, so the product page, the cards and the landing pages
          can each look the way you want.
        </p>

        {fetcher.data?.ok && (
          <div
            role="status"
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 8,
              background: "#eaf7ed",
              color: "#1a5e2a",
            }}
          >
            Settings saved.{" "}
            {fetcher.data.cleared
              ? fetcher.data.inactive
                ? `The selected discount is not active, so sale prices were cleared.`
                : fetcher.data.notFound
                  ? `The selected discount could not be found, so sale prices were cleared.`
                  : `No discount is selected, so sale prices were cleared.`
              : `${fetcher.data.count} discounted product(s) synced from “${fetcher.data.discountTitle}”.`}
            {!fetcher.data.cleared &&
              fetcher.data.subPct != null &&
              ` Subscribe ${fetcher.data.subPct}% off${
                fetcher.data.subPctSource === "fallback"
                  ? " (manual fallback — the selling plan could not be read)"
                  : " (from the selling plan)"
              }.`}
            {!fetcher.data.cleared &&
              fetcher.data.subPct == null &&
              ` No subscribe % was found — set a manual fallback below if you want subscribe prices shown.`}
          </div>
        )}
        {fetcher.data?.error && (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 8,
              background: "#fff1f0",
              color: "#8e1f0b",
            }}
          >
            {fetcher.data.settingsSaved
              ? "Settings were saved, but discount sync failed: "
              : ""}
            {fetcher.data.error}
          </div>
        )}

        <fetcher.Form method="post">
          <input
            type="hidden"
            name="discountTitle"
            value={selectedDiscount ? selectedDiscount.title : ""}
          />

          <s-section heading="Discount to show">
            <div style={{ padding: 4 }}>
              <Help>
                Only the discount you pick here is shown on the storefront.
                Other discounts in admin still apply at checkout — this app
                only changes what the price looks like on the page. When you
                change a discount in admin, the app re-syncs it automatically,
                so changing the discount after Nov 25 updates every
                price and badge on the storefront with no other step.
              </Help>
              {savedDiscountMissing && (
                <p
                  role="alert"
                  style={{
                    margin: "0 0 12px",
                    padding: 10,
                    borderRadius: 8,
                    background: "#fff1f0",
                    color: "#8e1f0b",
                    fontSize: 14,
                  }}
                >
                  The previously selected discount (“{settings.discountTitle || settings.discountId}”)
                  no longer exists in admin. Pick another discount below, or
                  “No discount”.
                </p>
              )}
              <div style={{ display: "grid", gap: 8 }}>
                <label
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "12px 14px",
                    border:
                      selectedDiscountId === ""
                        ? "2px solid #008060"
                        : "1px solid #c9cccf",
                    borderRadius: 10,
                    cursor: "pointer",
                    background: selectedDiscountId === "" ? "#eaf7ed" : "white",
                  }}
                >
                  <input
                    type="radio"
                    name="discountId"
                    value=""
                    checked={selectedDiscountId === ""}
                    onChange={() => setSelectedDiscountId("")}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong>No discount</strong>
                    <span style={fieldHelpStyle}>
                      Hide all sale prices from the storefront.
                    </span>
                  </span>
                </label>
                {discounts.map((discount) => (
                  <label
                    key={discount.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      padding: "12px 14px",
                      border:
                        selectedDiscountId === discount.id
                          ? "2px solid #008060"
                          : "1px solid #c9cccf",
                      borderRadius: 10,
                      cursor: "pointer",
                      background:
                        selectedDiscountId === discount.id ? "#eaf7ed" : "white",
                      opacity: discount.status === "ACTIVE" ? 1 : 0.65,
                    }}
                  >
                    <input
                      type="radio"
                      name="discountId"
                      value={discount.id}
                      checked={selectedDiscountId === discount.id}
                      onChange={() => setSelectedDiscountId(discount.id)}
                      style={{ marginTop: 3 }}
                    />
                    <span style={{ minWidth: 0 }}>
                      <strong>{discount.title}</strong>{" "}
                      <span
                        style={{
                          display: "inline-block",
                          padding: "1px 8px",
                          borderRadius: 999,
                          background:
                            discount.status === "ACTIVE" ? "#eaf7ed" : "#f1f1f1",
                          color:
                            discount.status === "ACTIVE" ? "#1a5e2a" : "#616161",
                          fontSize: 12,
                          fontWeight: 700,
                          verticalAlign: "1px",
                        }}
                      >
                        {discount.status === "ACTIVE" ? "Active" : discount.status}
                      </span>{" "}
                      <span
                        style={{
                          display: "inline-block",
                          padding: "1px 8px",
                          borderRadius: 999,
                          background: "#f1f1f1",
                          color: "#616161",
                          fontSize: 12,
                          verticalAlign: "1px",
                        }}
                      >
                        {discount.type === "code" ? "Code" : "Automatic"}
                      </span>
                      <span style={fieldHelpStyle}>
                        {discount.summary}
                        {discount.startsAt
                          ? ` · from ${formatDate(discount.startsAt)}`
                          : ""}
                        {discount.endsAt
                          ? ` · ends ${formatDate(discount.endsAt)}`
                          : ""}
                      </span>
                    </span>
                  </label>
                ))}
                {discounts.length === 0 && (
                  <p style={{ color: "#616161", fontSize: 14 }}>
                    No discounts found in this store yet. Create one in Shopify
                    admin first, then come back here to pick it.
                  </p>
                )}
              </div>
            </div>
          </s-section>

          <s-section heading="Price layout">
            <div style={{ padding: 4 }}>
              <Help>
                How the sale price looks everywhere, unless a place below
                overrides it. The preview shows the layout with the example
                prices $50.97 and $59.97.
              </Help>
              <div
                style={{
                  marginBottom: 16,
                  padding: "14px 16px",
                  border: "1px solid #c9cccf",
                  borderRadius: 10,
                  background: "#f9f9f9",
                  fontSize: "1.15rem",
                }}
              >
                {originalFirst === "original" ? (
                  <>
                    {previewOrig} {previewSale} {previewBadge}
                  </>
                ) : (
                  <>
                    {previewSale} {previewOrig} {previewBadge}
                  </>
                )}
              </div>
              <div
                style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}
              >
                <input
                  id="settings-enabled"
                  aria-label="Enable discounted price display"
                  type="checkbox"
                  name="enabled"
                  defaultChecked={settings.enabled}
                />
                <span>
                  <strong>Enable discounted price display</strong>
                  <span style={fieldHelpStyle}>
                    Show synced sale prices on your online store.
                  </span>
                </span>
              </div>
              <div style={{ display: "grid", gap: 16 }}>
                <div
                  style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
                >
                  <input
                    id="settings-show-on-cards"
                    aria-label="Show discounted prices on product cards"
                    type="checkbox"
                    name="showOnCards"
                    defaultChecked={settings.showOnCards}
                  />
                  <span>
                    <strong>Product cards</strong>
                    <span style={fieldHelpStyle}>
                      Show sale prices on collection and home page cards. For
                      variant-specific discounts, the product link must include
                      its variant ID; otherwise the card price is left unchanged
                      to avoid displaying a mismatched price.
                    </span>
                  </span>
                </div>
                <div
                  style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
                >
                  <input
                    id="settings-show-on-product-page"
                    aria-label="Show discounted prices on product pages"
                    type="checkbox"
                    name="showOnProductPage"
                    defaultChecked={settings.showOnProductPage}
                  />
                  <span>
                    <strong>Product pages</strong>
                    <span style={fieldHelpStyle}>
                      Show sale prices on the main product page and in the
                      Appstle widget's one-time row. The app only rewrites
                      the one-time price — when a buyer picks a subscription
                      option, the subscription price is left alone.
                    </span>
                  </span>
                </div>
                <div
                  style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
                >
                  <input
                    id="settings-show-on-landing-pages"
                    aria-label="Show discounted prices on landing pages"
                    type="checkbox"
                    name="showOnLandingPages"
                    defaultChecked={settings.showOnLandingPages !== false}
                  />
                  <span>
                    <strong>Landing pages</strong>
                    <span style={fieldHelpStyle}>
                      Show sale prices in landing-page buy boxes, CTA buttons
                      and badges. Only the one-time price is rewritten —
                      subscribe prices and the buy box&apos;s own One-time /
                      Subscribe switch are left alone.
                    </span>
                  </span>
                </div>
              </div>
              {renderChoiceRow(
                "originalFirst",
                PRICE_ORDER,
                originalFirst,
                setOriginalFirst,
                "Original price position",
                "Sale price first matches how Appstle shows its Subscribe row (sale, struck original, badge). Applies everywhere unless a place below sets its own position.",
              )}
              {renderColorField(
                "saleColor",
                saleColor,
                setSaleColor,
                "Sale price colour",
                "The colour of the discounted price everywhere, unless a place below sets its own.",
              )}
            </div>
          </s-section>

          <s-section heading="Badge design">
            <div style={{ padding: 4 }}>
              <Help>
                The default look of the “Save %” badge everywhere, unless a
                place below overrides it. The defaults match Appstle's own
                badge (dark green #42572A, white text, pill), so the app's
                badge and Appstle's Subscribe badge look the same side by
                side. This app never changes Appstle's badges — those are
                designed in Appstle.
              </Help>
              {renderCheckbox(
                "settings-badge-enabled",
                "badgeEnabled",
                badgeEnabled,
                setBadgeEnabled,
                "Show a “Save %” badge",
                "The percentage is worked out from the original and sale prices — it is never typed in by hand.",
              )}
              {renderChoiceRow(
                "badgeStyle",
                BADGE_STYLES,
                badgeStyle,
                setBadgeStyle,
                "Badge shape",
                "Pill matches Appstle's badge shape.",
              )}
              {renderChoiceRow(
                "badgeSize",
                BADGE_SIZES,
                badgeSize,
                setBadgeSize,
                "Badge size",
                "Medium matches the size of Appstle's badge on the product page.",
              )}
              {renderColorField(
                "badgeBg",
                badgeBg,
                setBadgeBg,
                "Badge background",
                "The badge fill colour. The default matches Appstle's badge.",
              )}
              {renderColorField(
                "badgeColor",
                badgeColor,
                setBadgeColor,
                "Badge text",
                "The badge text colour.",
              )}
            </div>
          </s-section>

          <s-section heading="Subscription prices (display only)">
            <div style={{ padding: 4 }}>
              <Help>
                This app does not manage subscriptions. It only reads the
                subscribe % so the storefront can display it — in the
                starburst, the buy-box row pills and the CTA text. The
                subscription itself, its plans and its badges stay in
                Appstle, and the owner designs the badges there. Change a
                plan in Appstle and the storefront updates on the next sync.
              </Help>
              <div style={{ display: "grid", gap: 16 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <strong>Selling plan group ID</strong>
                  <input
                    type="text"
                    name="sellingPlanGroupId"
                    defaultValue={settings.sellingPlanGroupId}
                    placeholder="gid://shopify/SellingPlanGroup/3389751513"
                    style={{
                      boxSizing: "border-box",
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid #8c9196",
                      borderRadius: 8,
                      font: "inherit",
                    }}
                  />
                  <span style={fieldHelpStyle}>
                    The Appstle group the subscribe % is read from. Only
                    change this if Appstle creates a new group.
                  </span>
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <strong>Subscribe % fallback (optional)</strong>
                  <input
                    type="number"
                    name="subPctFallback"
                    min="1"
                    max="100"
                    step="0.5"
                    defaultValue={
                      settings.subPctFallback != null
                        ? settings.subPctFallback
                        : ""
                    }
                    placeholder="e.g. 20"
                    style={{
                      boxSizing: "border-box",
                      width: 140,
                      padding: "10px 12px",
                      border: "1px solid #8c9196",
                      borderRadius: 8,
                      font: "inherit",
                    }}
                  />
                  <span style={fieldHelpStyle}>
                    A whole-number percent (20 = 20% off). Used only when the
                    selling plan cannot be read. Leave blank to rely on the
                    plan alone.
                  </span>
                </label>
              </div>
            </div>
          </s-section>

          <s-section heading="Where prices appear">
            <div style={{ padding: 4 }}>
              <Help>
                One card per place a price can appear. Each place has its own
                selectors and its own price order, badge and colours — a place
                left at its defaults follows the Price layout and Badge design
                above. Remove every selector from a place to turn that place
                off (product cards and the product page always need at least
                one selector).
              </Help>
              {SLOT_DEFS.map((def) => renderSlotCard(def))}
            </div>
          </s-section>

          <s-section heading="Custom CSS">
            <div style={{ padding: 4 }}>
              <Help>
                Extra CSS applied on every page where the discount display
                runs. Use it to style anything differently — for example the
                sale price or a badge — without touching the theme. It is
                injected as a style element, so it applies everywhere the
                app runs.
              </Help>
              <textarea
                name="customCss"
                value={customCss}
                onChange={(event) => setCustomCss(event.target.value)}
                placeholder={".dd-sale { font-weight: 700; }"}
                rows={6}
                aria-label="Custom CSS"
                style={{
                  boxSizing: "border-box",
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #8c9196",
                  borderRadius: 8,
                  font: "inherit",
                  fontFamily: "monospace",
                  resize: "vertical",
                }}
              />
            </div>
          </s-section>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 20,
            }}
          >
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "11px 18px",
                border: 0,
                borderRadius: 8,
                background: saving ? "#8c9196" : "#008060",
                color: "white",
                fontWeight: 600,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "Saving and syncing..." : "Save and sync discounts"}
            </button>
          </div>
        </fetcher.Form>
      </div>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
