import type { MarketplaceFunctions } from "@/lib/broker";
import type { ManagerFunctions } from "@/lib/poManager";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      branches: {
        Row: {
          cluster_id: string
          code: string
          created_at: string
          display_order: number
          id: string
          name: string
        }
        Insert: {
          cluster_id: string
          code: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
        }
        Update: {
          cluster_id?: string
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      clusters: {
        Row: {
          created_at: string
          display_order: number
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          display_order: number
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      admin_events: {
        Row: {
          actor_id: string
          action: string
          target_type: string
          target_id: string
          metadata: Json | null
          created_at: string
          id: string
        }
        Insert: {
          actor_id: string
          action: string
          target_type: string
          target_id: string
          metadata?: Json | null
          created_at?: string
          id?: string
        }
        Update: {
          actor_id?: string
          action?: string
          target_type?: string
          target_id?: string
          metadata?: Json | null
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brokers: {
        Row: {
          broker_ref: string
          suspended_at: string | null
          status_reason: string | null
          status_changed_at: string | null
          status_changed_by: string | null
          approved_at: string | null
          approved_by: string | null
          company_name: string
          contact_name: string
          created_at: string
          email: string
          id: string
          phone: string
          status: Database["public"]["Enums"]["broker_status"]
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_name: string
          contact_name: string
          created_at?: string
          email: string
          id: string
          phone: string
          status?: Database["public"]["Enums"]["broker_status"]
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_name?: string
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          phone?: string
          status?: Database["public"]["Enums"]["broker_status"]
        }
        Relationships: []
      }
      case_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          case_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          notes: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          case_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          notes?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          case_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_offers: {
        Row: {
          case_id: string
          id: string
          inspection_completed: boolean
          inspection_notes: string | null
          offer_price: number
          purchase_officer_id: string
          submitted_at: string
        }
        Insert: {
          case_id: string
          id?: string
          inspection_completed: boolean
          inspection_notes?: string | null
          offer_price: number
          purchase_officer_id: string
          submitted_at?: string
        }
        Update: {
          case_id?: string
          id?: string
          inspection_completed?: boolean
          inspection_notes?: string | null
          offer_price?: number
          purchase_officer_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_offers_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_offers_purchase_officer_id_fkey"
            columns: ["purchase_officer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      case_photos: {
        Row: {
          broker_visible: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          case_id: string
          category: string
          created_at: string
          file_size_bytes: number
          id: string
          is_plate_visible: boolean
          mime_type: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          case_id: string
          category: string
          created_at?: string
          file_size_bytes: number
          id?: string
          is_plate_visible?: boolean
          mime_type: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          case_id?: string
          category?: string
          created_at?: string
          file_size_bytes?: number
          id?: string
          is_plate_visible?: boolean
          mime_type?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_photos_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      case_ref_counters: {
        Row: {
          branch_id: string
          next_seq: number
          yyyymm: string
        }
        Insert: {
          branch_id: string
          next_seq?: number
          yyyymm: string
        }
        Update: {
          branch_id?: string
          next_seq?: number
          yyyymm?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_ref_counters_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          color: string | null
          evaluation_started_at: string | null
          assigned_po_id: string | null
          branch_id: string
          broker_consent: boolean | null
          broker_consent_at: string | null
          cancelled_at: string | null
          cancelled_reason: string | null
          case_ref: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          customer_decision: Database["public"]["Enums"]["customer_decision_type"] | null
          customer_decision_at: string | null
          customer_decision_by: string | null
          customer_counter_offer_at: string | null
          customer_counter_offer_by: string | null
          customer_counter_offer_note: string | null
          customer_counter_offer_price: number | null
          customer_expected_price: number | null
          customer_mobile: string | null
          customer_name: string | null
          fuel_type: Database["public"]["Enums"]["fuel_type"] | null
          has_loan: boolean | null
          id: string
          lender_note: string | null
          listed_at: string | null
          make: string | null
          model: string | null
          odometer_km: number | null
          ownership_count: number | null
          registration_year: number | null
          sales_officer_id: string
          status: Database["public"]["Enums"]["case_status"]
          submitted_at: string | null
          transmission: Database["public"]["Enums"]["transmission_type"] | null
          updated_at: string
          variant: string | null
          vehicle_reg_number: string | null
          withdrawn_at: string | null
          withdrawn_reason: string | null
        }
        Insert: {
          color?: string | null
          assigned_po_id?: string | null
          branch_id: string
          broker_consent?: boolean | null
          broker_consent_at?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          case_ref?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          customer_decision?: Database["public"]["Enums"]["customer_decision_type"] | null
          customer_decision_at?: string | null
          customer_decision_by?: string | null
          customer_counter_offer_at?: string | null
          customer_counter_offer_by?: string | null
          customer_counter_offer_note?: string | null
          customer_counter_offer_price?: number | null
          customer_expected_price?: number | null
          customer_mobile?: string | null
          customer_name?: string | null
          fuel_type?: Database["public"]["Enums"]["fuel_type"] | null
          has_loan?: boolean | null
          id?: string
          lender_note?: string | null
          listed_at?: string | null
          make?: string | null
          model?: string | null
          odometer_km?: number | null
          ownership_count?: number | null
          registration_year?: number | null
          sales_officer_id: string
          status?: Database["public"]["Enums"]["case_status"]
          submitted_at?: string | null
          transmission?: Database["public"]["Enums"]["transmission_type"] | null
          updated_at?: string
          variant?: string | null
          vehicle_reg_number?: string | null
          withdrawn_at?: string | null
          withdrawn_reason?: string | null
        }
        Update: {
          color?: string | null
          assigned_po_id?: string | null
          branch_id?: string
          broker_consent?: boolean | null
          broker_consent_at?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          case_ref?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          customer_decision?: Database["public"]["Enums"]["customer_decision_type"] | null
          customer_decision_at?: string | null
          customer_decision_by?: string | null
          customer_counter_offer_at?: string | null
          customer_counter_offer_by?: string | null
          customer_counter_offer_note?: string | null
          customer_counter_offer_price?: number | null
          customer_expected_price?: number | null
          customer_mobile?: string | null
          customer_name?: string | null
          fuel_type?: Database["public"]["Enums"]["fuel_type"] | null
          has_loan?: boolean | null
          id?: string
          lender_note?: string | null
          listed_at?: string | null
          make?: string | null
          model?: string | null
          odometer_km?: number | null
          ownership_count?: number | null
          registration_year?: number | null
          sales_officer_id?: string
          status?: Database["public"]["Enums"]["case_status"]
          submitted_at?: string | null
          transmission?: Database["public"]["Enums"]["transmission_type"] | null
          updated_at?: string
          variant?: string | null
          vehicle_reg_number?: string | null
          withdrawn_at?: string | null
          withdrawn_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_assigned_po_id_fkey"
            columns: ["assigned_po_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_customer_decision_by_fkey"
            columns: ["customer_decision_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_sales_officer_id_fkey"
            columns: ["sales_officer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          branch_id: string | null
          cluster_id: string | null
          created_at: string
          employee_id: string
          full_name: string
          id: string
          is_active: boolean
          last_assigned_at: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          branch_id?: string | null
          cluster_id?: string | null
          created_at?: string
          employee_id: string
          full_name: string
          id: string
          is_active?: boolean
          last_assigned_at?: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          branch_id?: string | null
          cluster_id?: string | null
          created_at?: string
          employee_id?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_assigned_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: MarketplaceFunctions & ManagerFunctions & {
      current_profile_branch: { Args: Record<PropertyKey, never>; Returns: string }
      current_profile_cluster: { Args: Record<PropertyKey, never>; Returns: string }
      current_profile_role: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["app_role"]
      }
      is_approved_broker: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_active_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      admin_dashboard_summary: { Args: Record<PropertyKey, never>; Returns: Json }
      admin_set_profile_active: {
        Args: { p_profile_id: string; p_active: boolean }
        Returns: undefined
      }
      admin_reassign_profile: {
        Args: {
          p_profile_id: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_branch_id?: string | null
          p_cluster_id?: string | null
          p_full_name?: string | null
        }
        Returns: undefined
      }
      cancel_case: {
        Args: { p_case_id: string; p_reason: string }
        Returns: Database["public"]["Tables"]["cases"]["Row"]
      }
      close_case: {
        Args: { p_case_id: string }
        Returns: Database["public"]["Tables"]["cases"]["Row"]
      }
      record_customer_decision: {
        Args: {
          p_case_id: string
          p_decision: Database["public"]["Enums"]["customer_decision_type"]
          p_broker_consent?: boolean | null
        }
        Returns: Database["public"]["Tables"]["cases"]["Row"]
      }
      record_customer_counter_offer: {
        Args: {
          p_case_id: string
          p_counter_offer_price: number
          p_note?: string | null
        }
        Returns: Database["public"]["Tables"]["cases"]["Row"]
      }
      submit_case_for_evaluation: {
        Args: { p_case_id: string }
        Returns: Database["public"]["Tables"]["cases"]["Row"]
      }
      submit_po_evaluation: {
        Args: {
          p_case_id: string
          p_inspection_completed: boolean
          p_inspection_notes: string | null
          p_offer_price: number
        }
        Returns: Database["public"]["Tables"]["cases"]["Row"]
      }
      withdraw_case: {
        Args: { p_case_id: string; p_reason: string }
        Returns: Database["public"]["Tables"]["cases"]["Row"]
      }
    }
    Enums: {
      app_role:
        | "sales_officer"
        | "purchase_officer"
        | "sales_manager"
        | "cluster_manager"
        | "po_manager"
        | "admin"
      broker_status: "pending" | "approved" | "rejected"
      case_status:
        | "draft"
        | "pending_evaluation"
        | "pending_customer_decision"
        | "purchase_completion_pending"
        | "closed"
        | "cancelled"
        | "withdrawn"
        | "rejected_not_listed"
        | "listed_for_brokers"
        | "broker_offer_selected"
        | "no_broker_interest"
        | "broker_deal_closed"
      customer_decision_type: "accepted" | "rejected"
      fuel_type: "petrol" | "diesel" | "cng" | "electric" | "hybrid"
      transmission_type: "manual" | "automatic"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database["public"]

export type Tables<
  T extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
> = (DefaultSchema["Tables"] & DefaultSchema["Views"])[T] extends { Row: infer R } ? R : never

export type TablesInsert<
  T extends keyof DefaultSchema["Tables"]
> = DefaultSchema["Tables"][T] extends { Insert: infer I } ? I : never

export type TablesUpdate<
  T extends keyof DefaultSchema["Tables"]
> = DefaultSchema["Tables"][T] extends { Update: infer U } ? U : never

export type Enums<T extends keyof DefaultSchema["Enums"]> = DefaultSchema["Enums"][T]
