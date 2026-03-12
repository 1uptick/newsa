export interface NewsItem {
  id: string;
  title: string;
  thumbnail: string;
  url: string;
  linkTrim?: string;
  summary: string;
  date: string;
  category?: string;
  source?: string;
}
