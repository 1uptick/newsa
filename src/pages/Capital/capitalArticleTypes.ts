/** Capital / Oneuptick articles list row (Airtable-backed). */
export interface CapitalItem {
  id: string;
  createdDate: string;
  title: string;
  excerpt: string;
  calculation: string;
  comments?: string;
  /** Oneuptick: Airtable `thumb_url`. */
  thumb_url?: string;
  /** Oneuptick: Airtable status column (default field name `Status`). */
  status?: string;
  /** Oneuptick Articles: optional Airtable publish column (see AIRTABLE_ONEUPTICK_ARTICLES_PUBLISH_STATUS_FIELD). */
  publish_status?: string;
  /** 1uptick SEO list: Airtable `site` (non-empty for listed rows). */
  site?: string;
  /** 1uptick SEO: Airtable `image_url` (thumbnail URL). */
  image_url?: string;
  /** 1uptick TradingView: Airtable `chart` (uploaded chart URL). */
  chartUrl?: string;
}
