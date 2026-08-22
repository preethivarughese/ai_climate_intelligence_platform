export interface RegionSummary {
  id: string;
  name: string;
  state: string;
  current_aqi: number;
  risk_level: string;
  primary_pollutant: string;
  active_events: number;
  data_source: string;
  status: string;
  plain_summary: string;
}
