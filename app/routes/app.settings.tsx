import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getSettings, saveSettings } from "../lib/settings.server";
import { LIMITS, parseSettings, type WidgetSettings } from "../lib/settings";
import { formatWindow, renderTemplate } from "../lib/feed";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { settings: await getSettings(session.shop) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = Object.fromEntries(await request.formData());
  const settings = parseSettings(form);
  await saveSettings(session.shop, settings);
  return { ok: true, savedAt: Date.now() };
};

type FieldEvent = { currentTarget: EventTarget | null };
const valueOf = (e: FieldEvent) => (e.currentTarget as HTMLInputElement | null)?.value ?? "";
const checkedOf = (e: FieldEvent) => Boolean((e.currentTarget as HTMLInputElement | null)?.checked);

export default function Settings() {
  const { settings } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<WidgetSettings>(settings);
  const set = <K extends keyof WidgetSettings>(key: K, value: WidgetSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    if (result?.ok) shopify.toast.show("Settings saved");
  }, [result?.savedAt, result?.ok, shopify]);

  const num = (key: keyof typeof LIMITS, label: string, suffix?: string, details?: string) => (
    <s-number-field
      name={key}
      label={label}
      min={LIMITS[key][0]}
      max={LIMITS[key][1]}
      defaultValue={String(settings[key])}
      {...(suffix ? { suffix } : {})}
      {...(details ? { details } : {})}
    />
  );

  return (
    <Form method="post" ref={formRef}>
      <s-page heading="Settings">
        <s-button slot="primary-action" variant="primary" onClick={() => formRef.current?.requestSubmit()}
          {...(navigation.state === "submitting" ? { loading: true } : {})}>
          Save
        </s-button>

        <s-section heading="General">
          <s-stack direction="block" gap="base">
            <s-switch name="enabled" value="true" label="Show notifications on my store" defaultChecked={settings.enabled}
              onChange={(e) => set("enabled", checkedOf(e))} />
            <s-select name="position" label="Position" value={draft.position}
              onChange={(e) => set("position", valueOf(e) as WidgetSettings["position"])}>
              <s-option value="bottom-left">Bottom left</s-option>
              <s-option value="bottom-right">Bottom right</s-option>
              <s-option value="top-left">Top left</s-option>
              <s-option value="top-right">Top right</s-option>
            </s-select>
            <s-select name="theme" label="Theme" value={draft.theme}
              onChange={(e) => set("theme", valueOf(e) as WidgetSettings["theme"])}>
              <s-option value="light">Light</s-option>
              <s-option value="dark">Dark</s-option>
            </s-select>
            <s-color-field name="accentColor" label="Accent colour (product name)" defaultValue={settings.accentColor}
              onChange={(e) => set("accentColor", valueOf(e))} />
            <s-checkbox name="hideOnMobile" value="true" label="Hide on mobile" defaultChecked={settings.hideOnMobile} />
            <s-text-area name="excludedPaths" label="Don't show on these pages" rows={3}
              details="One path per line, e.g. /cart. Matches the start of the URL path."
              defaultValue={settings.excludedPaths} />
          </s-stack>
        </s-section>

        <s-section heading="Timing">
          <s-stack direction="block" gap="base">
            {num("initialDelaySec", "Delay before first notification", "sec")}
            {num("displaySec", "Show each notification for", "sec")}
            {num("gapSec", "Gap between notifications", "sec")}
            <s-checkbox name="randomizeGap" value="true" label="Randomise the gap (feels more natural)"
              defaultChecked={settings.randomizeGap} />
            {num("maxPerPage", "Maximum notifications per page view")}
          </s-stack>
        </s-section>

        <s-section heading="Recent purchases">
          <s-stack direction="block" gap="base">
            {num("lookbackHours", "Show purchases from the last", "hours")}
            <s-select name="nameStyle" label="Customer name" value={draft.nameStyle}
              onChange={(e) => set("nameStyle", valueOf(e) as WidgetSettings["nameStyle"])}>
              <s-option value="first">First name (Sarah)</s-option>
              <s-option value="initial">Initial (S.)</s-option>
              <s-option value="anonymous">Anonymous label</s-option>
            </s-select>
            <s-text-field name="anonymousLabel" label="Anonymous label" defaultValue={settings.anonymousLabel}
              details="Used when a name isn't available." onInput={(e) => set("anonymousLabel", valueOf(e))} />
            <s-checkbox name="showLocation" value="true" label="Show city / state" defaultChecked={settings.showLocation}
              onChange={(e) => set("showLocation", checkedOf(e))} />
            <s-checkbox name="showTimeAgo" value="true" label="Show “2 hours ago”" defaultChecked={settings.showTimeAgo}
              onChange={(e) => set("showTimeAgo", checkedOf(e))} />
            <s-text-field name="purchaseTemplate" label="Message" defaultValue={settings.purchaseTemplate}
              details="Placeholders: {{name}}, {{location}}, {{product}}"
              onInput={(e) => set("purchaseTemplate", valueOf(e))} />
          </s-stack>
        </s-section>

        <s-section heading="Best-seller roundups">
          <s-stack direction="block" gap="base">
            <s-checkbox name="roundupsEnabled" value="true" label="Show “12 people bought X” roundups"
              defaultChecked={settings.roundupsEnabled} />
            {num("roundupWindowHours", "Count orders from the last", "hours")}
            {num("roundupMinCount", "Only show when at least this many people bought it")}
            <s-text-field name="roundupTemplate" label="Message" defaultValue={settings.roundupTemplate}
              details="Placeholders: {{count}}, {{product}}, {{window}}"
              onInput={(e) => set("roundupTemplate", valueOf(e))} />
          </s-stack>
        </s-section>

        <s-section>
          <s-button type="submit" variant="primary">Save settings</s-button>
        </s-section>

        <s-section slot="aside" heading="Preview">
          <Preview s={draft} />
        </s-section>
      </s-page>
    </Form>
  );
}

function Preview({ s }: { s: WidgetSettings }) {
  const dark = s.theme === "dark";
  const name = s.nameStyle === "anonymous" ? s.anonymousLabel : s.nameStyle === "initial" ? "S." : "Sarah";
  const product = "Sparkling Rosé 750ml";
  const purchase = renderTemplate(s.purchaseTemplate, {
    name, product, location: s.showLocation ? "Sydney, NSW" : "",
  });
  const roundup = renderTemplate(s.roundupTemplate, {
    count: "14", product, window: formatWindow(s.roundupWindowHours),
  });
  const card = (msg: string, time?: string) => {
    const [before, after] = msg.split(product);
    return (
      <div style={{
        display: "flex", gap: 12, alignItems: "center", padding: 12, borderRadius: 12, marginBottom: 12,
        background: dark ? "#1f1f1f" : "#fff", color: dark ? "#f2f2f2" : "#1a1a1a",
        boxShadow: "0 6px 24px rgba(0,0,0,.15)", fontSize: 13, lineHeight: 1.35,
      }}>
        <div style={{ width: 48, height: 48, borderRadius: 8, background: dark ? "#333" : "#eee", flex: "none" }} />
        <div>
          <div>
            {before}
            {after !== undefined && <strong style={{ color: dark ? undefined : s.accentColor }}>{product}</strong>}
            {after}
          </div>
          {time && s.showTimeAgo && <div style={{ opacity: 0.6, fontSize: 11, marginTop: 4 }}>{time}</div>}
        </div>
      </div>
    );
  };
  return (
    <div>
      {card(purchase, "12 minutes ago")}
      {card(roundup)}
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
