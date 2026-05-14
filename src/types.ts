// Types for the Flappie cloud API. Hand-written to match openapi.yaml. The
// vendor has not published an official spec, so treat these as best-effort
// shapes observed against the live service - some fields may be incomplete
// or change without notice.

export type DoorPolicy = "OPEN" | "CLOSED" | "OPEN_IN" | "OPEN_OUT";

export type Gender = "FEMALE" | "MALE" | "UNKNOWN";

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  zone_info: string;
  country_code: string;
  ai_training_preference: boolean;
  receive_marketing_email: boolean;
  language: string;
  [key: string]: unknown;
}

export interface Device {
  id: string;
  name: string | null;
  model: string;
  firmware_version: string;
  software_version: string;
  registered_at: string;
  created_at: string;
  updated_at: string;
  zone_info: string;
  display_region_label: string;
  country_code: string;
  operational_status: number;
  is_active: boolean | null;
  [key: string]: unknown;
}

export interface DeviceInformation extends Device {
  ai_model: string;
}

export interface DeviceStatus {
  state: "unlocked" | "locked";
  reason: string | null;
  lock_started_at: string | null;
  lock_until: string | null;
}

export interface DeviceSettings {
  id: number;
  catflap_id: string;
  open_status: DoorPolicy;
  /**
   * Reads back as a boolean from the GET endpoint, but PATCH accepts a
   * `DoorPolicy` value. Likely a backend leftover.
   */
  power_off_open_status: DoorPolicy | boolean;
  buttons_enabled: boolean;
  rfid: boolean;
  prey_detection: boolean;
  prey_detection_user_preference: boolean;
  prey_detection_system_lock: boolean;
  prey_timed_lock_enabled: boolean;
  prey_timed_lock_duration_seconds: number;
  zone_info: string;
  active_plan: number | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface DeviceSettingsPatch {
  open_status?: DoorPolicy;
  power_off_open_status?: DoorPolicy | boolean;
  buttons_enabled?: boolean;
  prey_detection_user_preference?: boolean;
  prey_timed_lock_enabled?: boolean;
  prey_timed_lock_duration_seconds?: number;
  rfid?: boolean;
}

export interface TimePlanRequest {
  open_time: string;
  close_time: string;
  open_status: DoorPolicy;
  weekdays: Weekday[];
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export interface TimePlan extends TimePlanRequest {
  id: number;
}

export interface Cat {
  id: number;
  name: string;
  birthday: string | null;
  gender: Gender;
  breed: string | null;
  weight: number | null;
  avatar_url?: string | null;
  [key: string]: unknown;
}

export interface CatRequest {
  name: string;
  birthday?: string;
  gender?: Gender;
  breed?: string;
  weight?: number;
}

export interface MediaFile {
  id: number;
  url: string;
}

export interface Bundle {
  id: number;
  catflap_id: string;
  is_viewed: boolean;
  is_favorite: boolean;
  is_prey: boolean;
  is_saved: boolean;
  image: string;
  image_files: MediaFile[];
  video_file: MediaFile | null;
  expired_at: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface BundlesPage {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  prev_page: number | null;
  next_page: number | null;
  records: Bundle[];
}

export interface ListBundlesOptions {
  page?: number;
  /** ISO date or datetime; filters records by `createdAt` >= from */
  from?: string;
  /** ISO date or datetime; filters records by `createdAt` <= to */
  to?: string;
  order?: "asc" | "desc";
  /** Only prey events when true; only non-prey when false. Omit for both. */
  onlyPrey?: boolean;
  /** Only viewed bundles when true; only unviewed when false. Omit for both. */
  isViewed?: boolean;
  /** Only never-seen bundles (mirrors the "Neu" filter in the app). */
  onlyNew?: boolean;
  /** Only bundles that have not been saved to a collection. */
  onlyUnsaved?: boolean;
}

export interface OperationalStatus {
  device_id: string;
  name: string;
  status: number;
  registration_date: string;
  prey_detection_user_preference: boolean;
  prey_detection_system_lock: boolean;
  signal_quality: number;
}

export interface Dashboard {
  blocked_prey: number;
  latest_prey_detection: unknown | null;
  operational_status: OperationalStatus[];
  banner: unknown | null;
  is_timeplan_active: boolean;
  [key: string]: unknown;
}

export interface GraphPoint {
  date: string;
  event_count: number;
  mean_event_count: number;
}

export interface HuntingStats {
  flappieverse_avg: number;
  household_avg: number;
  hunt_comparison: string;
  hunt_percentage_diff: number;
  less: boolean;
  top_n: number;
  [key: string]: unknown;
}

export interface BreedTypes {
  breed_types: { key: string; value: string }[];
}

export type StatsGroupBy = "hour" | "day" | "week" | "month";

export interface StatsOptions {
  groupBy?: StatsGroupBy;
  startDate?: string;
  endDate?: string;
}
