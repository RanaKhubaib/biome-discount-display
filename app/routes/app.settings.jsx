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
  const settings = {
    enabled: f.get("enabled") === "on",
    showOnCards: f.get("showOnCards") === "on",
    showOnProductPage: f.get("showOnProductPage") === "on",
    showOnLandingPages,
    saleColor: String(f.get("saleColor") || "#d82c0d"),
    cardSelectors,
    productSelectors,
    landingSelectors,
    discountId: discountId || null,
    discountTitle: String(f.get("discountTitle") || ""),
    badgeEnabled: f.get("badgeEnabled") === "on",
    badgeStyle: String(f.get("badgeStyle") || "pill"),
    badgeSize: String(f.get("badgeSize") || "medium"),
    badgeBg: String(f.get("badgeBg") || "#42572A"),
    badgeColor: String(f.get("badgeColor") || "#ffffff"),
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

export default function Settings() {
  const { settings, discounts } = useLoaderData();
  const fetcher = useFetcher();
  const saving = fetcher.state !== "idle";
  const [cardSelectors, setCardSelectors] = useState(settings.cardSelectors);
  const [productSelectors, setProductSelectors] = useState(
    settings.productSelectors,
  );
  const [landingSelectors, setLandingSelectors] = useState(
    settings.landingSelectors,
  );
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
  ) => (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{label}</h3>
      <p style={{ margin: "0 0 12px", color: "#616161", fontSize: 14 }}>
        {help}
      </p>
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
              disabled={selectors.length === 1}
              aria-label={`Remove ${label.toLowerCase()} selector ${index + 1}`}
              style={{
                padding: "8px 10px",
                border: "1px solid #c9cccf",
                borderRadius: 8,
                background: "white",
                cursor: selectors.length === 1 ? "not-allowed" : "pointer",
                opacity: selectors.length === 1 ? 0.5 : 1,
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

  const renderChoiceRow = (name, options, value, onChange, label) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{label}</div>
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

  return (
    <s-page heading="Discount price settings">
      <div
        style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 40px" }}
      >
        <p style={{ margin: "0 0 20px", color: "#616161", lineHeight: 1.5 }}>
          Choose which discount to show, how the sale price and badge look,
          and where on your storefront they appear.
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
              <p style={{ margin: "0 0 12px", color: "#616161", fontSize: 14 }}>
                Only the discount you pick here is shown on the storefront.
                Other discounts in admin still apply at checkout — this app
                only changes what the price looks like on the page. When you
                change a discount in admin, the app re-syncs it automatically.
              </p>
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
                    <span
                      style={{
                        display: "block",
                        marginTop: 3,
                        color: "#616161",
                        fontSize: 14,
                      }}
                    >
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
                      <span
                        style={{
                          display: "block",
                          marginTop: 3,
                          color: "#616161",
                          fontSize: 14,
                        }}
                      >
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

          <s-section heading="Badge design">
            <div style={{ padding: 4 }}>
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
                <span style={{ opacity: 0.6, marginRight: "0.4em" }}>
                  <s>$59.97</s>
                </span>
                <span style={{ fontWeight: 600 }}>$50.97</span>{" "}
                {badgeEnabled && (
                  <span
                    style={{
                      display: "inline-block",
                      marginLeft: 8,
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
                )}
              </div>
              <div
                style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}
              >
                <input
                  id="settings-badge-enabled"
                  aria-label="Show a Save badge next to the sale price"
                  type="checkbox"
                  name="badgeEnabled"
                  checked={badgeEnabled}
                  onChange={(event) => setBadgeEnabled(event.target.checked)}
                />
                <span>
                  <strong>Show a “Save %” badge</strong>
                  <span
                    style={{
                      display: "block",
                      marginTop: 3,
                      color: "#616161",
                      fontSize: 14,
                    }}
                  >
                    The percentage is worked out from the original and sale
                    prices — it is never typed in by hand.
                  </span>
                </span>
              </div>
              {renderChoiceRow(
                "badgeStyle",
                BADGE_STYLES,
                badgeStyle,
                setBadgeStyle,
                "Badge shape",
              )}
              {renderChoiceRow(
                "badgeSize",
                BADGE_SIZES,
                badgeSize,
                setBadgeSize,
                "Badge size",
              )}
              <div style={{ display: "grid", gap: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <strong>Badge background</strong>
                  <input
                    type="color"
                    name="badgeBg"
                    value={badgeBg}
                    onChange={(event) => setBadgeBg(event.target.value)}
                    aria-label="Badge background color"
                    style={{
                      width: 48,
                      height: 40,
                      padding: 2,
                      border: "1px solid #8c9196",
                      borderRadius: 8,
                    }}
                  />
                  <span style={{ color: "#616161", fontSize: 14 }}>{badgeBg}</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <strong>Badge text</strong>
                  <input
                    type="color"
                    name="badgeColor"
                    value={badgeColor}
                    onChange={(event) => setBadgeColor(event.target.value)}
                    aria-label="Badge text color"
                    style={{
                      width: 48,
                      height: 40,
                      padding: 2,
                      border: "1px solid #8c9196",
                      borderRadius: 8,
                    }}
                  />
                  <span style={{ color: "#616161", fontSize: 14 }}>{badgeColor}</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <strong>Sale price color</strong>
                  <input
                    type="color"
                    name="saleColor"
                    defaultValue={settings.saleColor}
                    aria-label="Sale price color"
                    style={{
                      width: 48,
                      height: 40,
                      padding: 2,
                      border: "1px solid #8c9196",
                      borderRadius: 8,
                    }}
                  />
                </label>
              </div>
            </div>
          </s-section>

          <s-section heading="Display">
            <div style={{ display: "grid", gap: 16, padding: 4 }}>
              <div
                style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
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
                  <span
                    style={{
                      display: "block",
                      marginTop: 3,
                      color: "#616161",
                      fontSize: 14,
                    }}
                  >
                    Show synced sale prices on your online store.
                  </span>
                </span>
              </div>
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
                  <span
                    style={{
                      display: "block",
                      marginTop: 3,
                      color: "#616161",
                      fontSize: 14,
                    }}
                  >
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
                  <span
                    style={{
                      display: "block",
                      marginTop: 3,
                      color: "#616161",
                      fontSize: 14,
                    }}
                  >
                    Show sale prices on the main product page. The app only
                    rewrites the one-time price — when a buyer picks a
                    subscription option, the subscription price is left alone.
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
                  <span
                    style={{
                      display: "block",
                      marginTop: 3,
                      color: "#616161",
                      fontSize: 14,
                    }}
                  >
                    Show sale prices in landing-page buy boxes. Only the
                    one-time price is rewritten — subscribe prices and the
                    buy box&apos;s own One-time / Subscribe switch are left
                    alone.
                  </span>
                </span>
              </div>
            </div>
          </s-section>

          <s-section heading="Theme price selectors">
            <div style={{ padding: 4 }}>
              {renderSelectors(
                "Product card price selectors",
                "cardSelectors",
                cardSelectors,
                setCardSelectors,
                ".price-item--regular",
                "Add every CSS selector your theme uses for prices on product cards. Each selector is checked.",
              )}
              {renderSelectors(
                "Product page price selectors",
                "productSelectors",
                productSelectors,
                setProductSelectors,
                ".price-item--regular",
                "Add every CSS selector your theme uses for the price on the main product page. Each selector is checked.",
              )}
              {renderSelectors(
                "Landing page price selectors",
                "landingSelectors",
                landingSelectors,
                setLandingSelectors,
                '.purchase-opt[data-purchase-opt="onetime"] .purchase-price',
                "Selectors for one-time prices on landing pages, for example the One-time purchase row in a buy box. Only add selectors for one-time prices — never add one that matches a subscribe price.",
              )}
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
