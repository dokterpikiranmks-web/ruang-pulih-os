export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PackageType = 'SINGLE_150K' | 'PACKAGE_3X_400K';

export type AppointmentStatus =
  | 'BOOKED'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'RESCHEDULED'
  | 'CANCELLED';

export type ProtocolStatus = 'DRAFT_REVIEW' | 'PUBLISHED';

export type WATriggerType =
  | 'BOOKING'
  | 'H_MINUS_1'
  | 'H_MINUS_2H'
  | 'POST_REVIEW'
  | 'H_PLUS_3';

export type WAQueueStatus = 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';

export interface Database {
  public: {
    Tables: {
      leads_triage: {
        Row: {
          id: string;
          complaint_category: string | null;
          duration: string | null;
          prior_treatments: Json | null;
          disrupted_activity: string | null;
          readiness_score: number;
          triage_summary: string | null;
          disclaimer_accepted: boolean;
          utm_source: string | null;
          utm_campaign: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          complaint_category?: string | null;
          duration?: string | null;
          prior_treatments?: Json | null;
          disrupted_activity?: string | null;
          readiness_score?: number;
          triage_summary?: string | null;
          disclaimer_accepted?: boolean;
          utm_source?: string | null;
          utm_campaign?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          complaint_category?: string | null;
          duration?: string | null;
          prior_treatments?: Json | null;
          disrupted_activity?: string | null;
          readiness_score?: number;
          triage_summary?: string | null;
          disclaimer_accepted?: boolean;
          utm_source?: string | null;
          utm_campaign?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      patients: {
        Row: {
          id: string;
          full_name: string;
          age: number | null;
          whatsapp: string;
          address: string | null;
          magic_token: string;
          pin_last4: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          age?: number | null;
          whatsapp: string;
          address?: string | null;
          magic_token: string;
          pin_last4: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          age?: number | null;
          whatsapp?: string;
          address?: string | null;
          magic_token?: string;
          pin_last4?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          patient_id: string;
          lead_id: string | null;
          slot_start: string;
          slot_end: string;
          package_type: PackageType;
          status: AppointmentStatus;
          amount_paid_idr: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          lead_id?: string | null;
          slot_start: string;
          slot_end: string;
          package_type?: PackageType;
          status?: AppointmentStatus;
          amount_paid_idr?: number;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          lead_id?: string | null;
          slot_start?: string;
          slot_end?: string;
          package_type?: PackageType;
          status?: AppointmentStatus;
          amount_paid_idr?: number;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      patient_intakes: {
        Row: {
          id: string;
          patient_id: string;
          red_flag_checklist: Json | null;
          has_red_flag: boolean;
          medications_json: Json | null;
          lab_results_json: Json | null;
          media_urls: Json | null;
          atm_timeline_json: Json | null;
          lifestyle_json: Json | null;
          autonomic_mindbody_json: Json | null;
          somatic_pain_map: Json | null;
          voice_transcript: string | null;
          practitioner_vitals_json: Json | null;
          practitioner_notes: string | null;
          confidence_score: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          red_flag_checklist?: Json | null;
          has_red_flag?: boolean;
          medications_json?: Json | null;
          lab_results_json?: Json | null;
          media_urls?: Json | null;
          atm_timeline_json?: Json | null;
          lifestyle_json?: Json | null;
          autonomic_mindbody_json?: Json | null;
          somatic_pain_map?: Json | null;
          voice_transcript?: string | null;
          practitioner_vitals_json?: Json | null;
          practitioner_notes?: string | null;
          confidence_score?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          red_flag_checklist?: Json | null;
          has_red_flag?: boolean;
          medications_json?: Json | null;
          lab_results_json?: Json | null;
          media_urls?: Json | null;
          atm_timeline_json?: Json | null;
          lifestyle_json?: Json | null;
          autonomic_mindbody_json?: Json | null;
          somatic_pain_map?: Json | null;
          voice_transcript?: string | null;
          practitioner_vitals_json?: Json | null;
          practitioner_notes?: string | null;
          confidence_score?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      clinical_protocols: {
        Row: {
          id: string;
          patient_id: string;
          intake_id: string | null;
          red_flag_status: boolean;
          red_flag_message: string | null;
          domain_scores_json: Json | null;
          agent_outputs_json: Json | null;
          safety_audit_json: Json | null;
          final_protocol_json: Json | null;
          practitioner_summary: string | null;
          patient_friendly_summary: string | null;
          loops_executed: number;
          status: ProtocolStatus;
          published_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          intake_id?: string | null;
          red_flag_status?: boolean;
          red_flag_message?: string | null;
          domain_scores_json?: Json | null;
          agent_outputs_json?: Json | null;
          safety_audit_json?: Json | null;
          final_protocol_json?: Json | null;
          practitioner_summary?: string | null;
          patient_friendly_summary?: string | null;
          loops_executed?: number;
          status?: ProtocolStatus;
          published_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          intake_id?: string | null;
          red_flag_status?: boolean;
          red_flag_message?: string | null;
          domain_scores_json?: Json | null;
          agent_outputs_json?: Json | null;
          safety_audit_json?: Json | null;
          final_protocol_json?: Json | null;
          practitioner_summary?: string | null;
          patient_friendly_summary?: string | null;
          loops_executed?: number;
          status?: ProtocolStatus;
          published_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      progress_logs: {
        Row: {
          id: string;
          patient_id: string;
          pain_score: number;
          sleep_score: number;
          stress_score: number;
          adherence_pct: number;
          patient_note: string | null;
          ai_adaptation_alert: string | null;
          alert_acknowledged: boolean;
          logged_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          pain_score: number;
          sleep_score: number;
          stress_score: number;
          adherence_pct?: number;
          patient_note?: string | null;
          ai_adaptation_alert?: string | null;
          alert_acknowledged?: boolean;
          logged_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          pain_score?: number;
          sleep_score?: number;
          stress_score?: number;
          adherence_pct?: number;
          patient_note?: string | null;
          ai_adaptation_alert?: string | null;
          alert_acknowledged?: boolean;
          logged_at?: string;
        };
        Relationships: [];
      };
      wa_queue: {
        Row: {
          id: string;
          appointment_id: string | null;
          patient_id: string;
          trigger_type: WATriggerType;
          scheduled_for: string;
          message_body: string;
          status: WAQueueStatus;
          retry_count: number;
          last_error: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          appointment_id?: string | null;
          patient_id: string;
          trigger_type: WATriggerType;
          scheduled_for: string;
          message_body: string;
          status?: WAQueueStatus;
          retry_count?: number;
          last_error?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          appointment_id?: string | null;
          patient_id?: string;
          trigger_type?: WATriggerType;
          scheduled_for?: string;
          message_body?: string;
          status?: WAQueueStatus;
          retry_count?: number;
          last_error?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ai_usage_logs: {
        Row: {
          id: string;
          endpoint: string;
          agent_name: string;
          model_name: string;
          input_tokens: number;
          output_tokens: number;
          cost_idr: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          endpoint: string;
          agent_name: string;
          model_name: string;
          input_tokens?: number;
          output_tokens?: number;
          cost_idr?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          endpoint?: string;
          agent_name?: string;
          model_name?: string;
          input_tokens?: number;
          output_tokens?: number;
          cost_idr?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      review_feedbacks: {
        Row: {
          id: string;
          appointment_id: string;
          patient_id: string;
          rating: number;
          comment: string | null;
          routed_to_gmaps: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          appointment_id: string;
          patient_id: string;
          rating: number;
          comment?: string | null;
          routed_to_gmaps?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          appointment_id?: string;
          patient_id?: string;
          rating?: number;
          comment?: string | null;
          routed_to_gmaps?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      patient_reviews: {
        Row: {
          id: string;
          appointment_id: string;
          patient_id: string;
          rating: number;
          feedback_text: string | null;
          routed_to_gmaps: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          appointment_id: string;
          patient_id: string;
          rating: number;
          feedback_text?: string | null;
          routed_to_gmaps?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          appointment_id?: string;
          patient_id?: string;
          rating?: number;
          feedback_text?: string | null;
          routed_to_gmaps?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      package_type: PackageType;
      appointment_status: AppointmentStatus;
      protocol_status: ProtocolStatus;
      wa_trigger_type: WATriggerType;
      wa_queue_status: WAQueueStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
