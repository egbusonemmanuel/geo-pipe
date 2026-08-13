export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export interface MeteringStation {
  id: string;
  name: string;
  coordinates: [number, number]; // [lon, lat]
  type: string;
  capacity_mmscfd: number;
}

export interface KPFeature {
  kp: number;
  pipeline_id: number;
  pipeline_code: string;
  pipeline_name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  slope_deg: number;
  river_proximity_km: number;
  fault_distance_km: number;
  soil_type: string;
  soil_risk: number;

  // 6 Quantitative Determinants (0.0 to 1.0)
  flooding_index: number;
  earthquake_factor: number;
  erosion_factor: number;
  landslide_index: number;
  soil_corrosivity_index: number;
  hoop_stress_ratio: number;

  // Pipe Specs
  pipe_diameter_inches: number;
  operating_pressure_psig: number;
  pipe_material: string;
  design_wall_thickness_mm: number;

  // Failure Diagnostics Output
  failure_probability: number;
  failure_probability_percent: number;
  risk_class: RiskLevel;
  primary_hazard: string;
  failure_code: string;
  diagnostic_message: string;
  remediation_plan: string;
}

export interface PipelineProperties {
  pipeline_id: number;
  code: string;
  name: string;
  substance: string;
  operator: string;
  pipe_diameter_inches: number;
  operating_pressure_psig: number;
  pipe_material: string;
  design_wall_thickness_mm: number;
  total_length_km: number;
  avg_failure_probability: number;
  max_failure_probability: number;
  risk_label: RiskLevel;
  critical_kps_count: number;
  high_kps_count: number;
  construction_start_date?: string;
  construction_age_years?: number;
  operational_start_date?: string;
  operational_age_years?: number;
  operational_status?: string;
  commissioning_note?: string;
}

export interface PipelineFeature {
  type: 'Feature';
  properties: PipelineProperties;
  geometry: {
    type: 'LineString';
    coordinates: number[][];
  };
}

export interface PipelineCollection {
  type: 'FeatureCollection';
  features: PipelineFeature[];
}
