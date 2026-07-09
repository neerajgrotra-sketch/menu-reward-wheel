export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_generated_assets: {
        Row: {
          asset_type: string
          created_at: string
          enhanced_prompt: string | null
          estimated_cost_usd: number | null
          generation_version: number
          id: string
          job_id: string | null
          menu_item_id: string | null
          model: string
          prompt_used: string
          provider: string
          restaurant_id: string
          selected: boolean
          selected_at: string | null
          storage_path: string
          storage_url: string
          variant_index: number
        }
        Insert: {
          asset_type?: string
          created_at?: string
          enhanced_prompt?: string | null
          estimated_cost_usd?: number | null
          generation_version?: number
          id?: string
          job_id?: string | null
          menu_item_id?: string | null
          model: string
          prompt_used: string
          provider: string
          restaurant_id: string
          selected?: boolean
          selected_at?: string | null
          storage_path: string
          storage_url: string
          variant_index?: number
        }
        Update: {
          asset_type?: string
          created_at?: string
          enhanced_prompt?: string | null
          estimated_cost_usd?: number | null
          generation_version?: number
          id?: string
          job_id?: string | null
          menu_item_id?: string | null
          model?: string
          prompt_used?: string
          provider?: string
          restaurant_id?: string
          selected?: boolean
          selected_at?: string | null
          storage_path?: string
          storage_url?: string
          variant_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_generated_assets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "image_generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generated_assets_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generated_assets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          active: boolean | null
          id: string
          name: string | null
          restaurant_id: string | null
        }
        Insert: {
          active?: boolean | null
          id?: string
          name?: string | null
          restaurant_id?: string | null
        }
        Update: {
          active?: boolean | null
          id?: string
          name?: string | null
          restaurant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          coupon_code: string
          customer_session_id: string | null
          id: string
          issued_at: string | null
          play_session_id: string | null
          promotion_id: string
          promotion_reward_id: string | null
          redeemed_at: string | null
          restaurant_id: string
          status: string
        }
        Insert: {
          coupon_code: string
          customer_session_id?: string | null
          id?: string
          issued_at?: string | null
          play_session_id?: string | null
          promotion_id: string
          promotion_reward_id?: string | null
          redeemed_at?: string | null
          restaurant_id: string
          status?: string
        }
        Update: {
          coupon_code?: string
          customer_session_id?: string | null
          id?: string
          issued_at?: string | null
          play_session_id?: string | null
          promotion_id?: string
          promotion_reward_id?: string | null
          redeemed_at?: string | null
          restaurant_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_play_session_id_fkey"
            columns: ["play_session_id"]
            isOneToOne: false
            referencedRelation: "play_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_promotion_reward_id_fkey"
            columns: ["promotion_reward_id"]
            isOneToOne: false
            referencedRelation: "promotion_rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          created_at: string
          id: string
          marketing_consent: boolean
          marketing_consent_timestamp: string | null
          phone_country_code: string | null
          phone_number_e164: string | null
          phone_number_raw: string | null
          terms_accepted_timestamp: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          marketing_consent?: boolean
          marketing_consent_timestamp?: string | null
          phone_country_code?: string | null
          phone_number_e164?: string | null
          phone_number_raw?: string | null
          terms_accepted_timestamp?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          marketing_consent?: boolean
          marketing_consent_timestamp?: string | null
          phone_country_code?: string | null
          phone_number_e164?: string | null
          phone_number_raw?: string | null
          terms_accepted_timestamp?: string
          updated_at?: string
        }
        Relationships: []
      }
      dashboard_assistant_conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_message_at: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          last_message_at?: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_assistant_conversations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_assistant_messages: {
        Row: {
          action: Json | null
          content: string
          conversation_id: string
          created_at: string
          created_by: string
          id: string
          intent: string | null
          outcome: Json | null
          related_message_id: string | null
          restaurant_id: string
          role: string
        }
        Insert: {
          action?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          created_by: string
          id?: string
          intent?: string | null
          outcome?: Json | null
          related_message_id?: string | null
          restaurant_id: string
          role: string
        }
        Update: {
          action?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          created_by?: string
          id?: string
          intent?: string | null
          outcome?: Json | null
          related_message_id?: string | null
          restaurant_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_assistant_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dashboard_assistant_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_assistant_messages_related_message_id_fkey"
            columns: ["related_message_id"]
            isOneToOne: false
            referencedRelation: "dashboard_assistant_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_assistant_messages_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer: string
          category: string
          created_at: string
          id: string
          is_active: boolean
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      games: {
        Row: {
          created_at: string
          default_coupon_expiry_minutes: number
          default_spins: number
          description: string | null
          game_config: Json
          icon: string | null
          id: string
          max_products: number
          max_rewards: number
          min_products: number
          min_rewards: number
          name: string
          slug: string
          sort_order: number
          status: string
          stop_on_win_default: boolean
          supports_coupon: boolean
          supports_try_again: boolean
          supports_weighting: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_coupon_expiry_minutes?: number
          default_spins?: number
          description?: string | null
          game_config?: Json
          icon?: string | null
          id?: string
          max_products?: number
          max_rewards?: number
          min_products?: number
          min_rewards?: number
          name: string
          slug: string
          sort_order?: number
          status?: string
          stop_on_win_default?: boolean
          supports_coupon?: boolean
          supports_try_again?: boolean
          supports_weighting?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_coupon_expiry_minutes?: number
          default_spins?: number
          description?: string | null
          game_config?: Json
          icon?: string | null
          id?: string
          max_products?: number
          max_rewards?: number
          min_products?: number
          min_rewards?: number
          name?: string
          slug?: string
          sort_order?: number
          status?: string
          stop_on_win_default?: boolean
          supports_coupon?: boolean
          supports_try_again?: boolean
          supports_weighting?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      guest_sessions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          played: boolean
          played_at: string | null
          promotion_id: string
          restaurant_id: string
          selected_game_type: string | null
          session_token: string
          state: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          played?: boolean
          played_at?: string | null
          promotion_id: string
          restaurant_id: string
          selected_game_type?: string | null
          session_token: string
          state?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          played?: boolean
          played_at?: string | null
          promotion_id?: string
          restaurant_id?: string
          selected_game_type?: string | null
          session_token?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_sessions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_sessions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      image_generation_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          menu_item_id: string
          restaurant_id: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          menu_item_id: string
          restaurant_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          menu_item_id?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "image_generation_jobs_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_generation_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_audit_log: {
        Row: {
          action: string
          admin_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: []
      }
      intelligence_experiments: {
        Row: {
          active: boolean
          created_at: string
          feature_key: string
          id: string
          name: string
          template_a_id: string
          template_b_id: string
          traffic_split_pct: number
          updated_at: string
          winner: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          feature_key: string
          id?: string
          name: string
          template_a_id: string
          template_b_id: string
          traffic_split_pct?: number
          updated_at?: string
          winner?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          feature_key?: string
          id?: string
          name?: string
          template_a_id?: string
          template_b_id?: string
          traffic_split_pct?: number
          updated_at?: string
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_experiments_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "intelligence_features"
            referencedColumns: ["feature_key"]
          },
          {
            foreignKeyName: "intelligence_experiments_template_a_id_fkey"
            columns: ["template_a_id"]
            isOneToOne: false
            referencedRelation: "intelligence_prompt_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_experiments_template_b_id_fkey"
            columns: ["template_b_id"]
            isOneToOne: false
            referencedRelation: "intelligence_prompt_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_features: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          feature_key: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          feature_key: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          feature_key?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      intelligence_generation_logs: {
        Row: {
          created_at: string
          error_message: string | null
          estimated_cost_usd: number | null
          experiment_id: string | null
          experiment_variant: string | null
          feature_key: string
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model: string
          output_tokens: number | null
          prompt_template_id: string | null
          provider: string
          restaurant_id: string | null
          success: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          estimated_cost_usd?: number | null
          experiment_id?: string | null
          experiment_variant?: string | null
          feature_key: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          output_tokens?: number | null
          prompt_template_id?: string | null
          provider: string
          restaurant_id?: string | null
          success: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          estimated_cost_usd?: number | null
          experiment_id?: string | null
          experiment_variant?: string | null
          feature_key?: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          prompt_template_id?: string | null
          provider?: string
          restaurant_id?: string | null
          success?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_generation_logs_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "intelligence_experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_generation_logs_prompt_template_id_fkey"
            columns: ["prompt_template_id"]
            isOneToOne: false
            referencedRelation: "intelligence_prompt_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_generation_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_prompt_templates: {
        Row: {
          active: boolean
          created_at: string
          feature_key: string
          id: string
          max_tokens: number
          model: string
          name: string
          notes: string | null
          provider: string
          status: string
          system_prompt: string | null
          temperature: number
          updated_at: string
          user_prompt_template: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          feature_key: string
          id?: string
          max_tokens?: number
          model?: string
          name: string
          notes?: string | null
          provider?: string
          status?: string
          system_prompt?: string | null
          temperature?: number
          updated_at?: string
          user_prompt_template: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          feature_key?: string
          id?: string
          max_tokens?: number
          model?: string
          name?: string
          notes?: string | null
          provider?: string
          status?: string
          system_prompt?: string | null
          temperature?: number
          updated_at?: string
          user_prompt_template?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_prompt_templates_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "intelligence_features"
            referencedColumns: ["feature_key"]
          },
        ]
      }
      intelligence_provider_costs: {
        Row: {
          active: boolean
          cost_per_generation: number | null
          created_at: string
          id: string
          input_cost_per_1m: number
          model: string
          output_cost_per_1m: number
          provider: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          cost_per_generation?: number | null
          created_at?: string
          id?: string
          input_cost_per_1m: number
          model: string
          output_cost_per_1m: number
          provider: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          cost_per_generation?: number | null
          created_at?: string
          id?: string
          input_cost_per_1m?: number
          model?: string
          output_cost_per_1m?: number
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      intelligence_usage_limits: {
        Row: {
          created_at: string
          current_month_usage: number
          id: string
          image_current_month_usage: number
          image_monthly_limit: number
          monthly_limit: number
          requests_per_minute: number
          restaurant_id: string
          updated_at: string
          usage_reset_at: string
        }
        Insert: {
          created_at?: string
          current_month_usage?: number
          id?: string
          image_current_month_usage?: number
          image_monthly_limit?: number
          monthly_limit?: number
          requests_per_minute?: number
          restaurant_id: string
          updated_at?: string
          usage_reset_at?: string
        }
        Update: {
          created_at?: string
          current_month_usage?: number
          id?: string
          image_current_month_usage?: number
          image_monthly_limit?: number
          monthly_limit?: number
          requests_per_minute?: number
          restaurant_id?: string
          updated_at?: string
          usage_reset_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_usage_limits_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      intervention_events: {
        Row: {
          accepted: boolean | null
          action_taken: string
          confidence_score: number
          conversion_value: number | null
          converted: boolean | null
          created_at: string
          dismissed: boolean | null
          id: string
          restaurant_id: string
          session_id: string
          shown_at: string
          trigger_type: string
        }
        Insert: {
          accepted?: boolean | null
          action_taken: string
          confidence_score?: number
          conversion_value?: number | null
          converted?: boolean | null
          created_at?: string
          dismissed?: boolean | null
          id?: string
          restaurant_id: string
          session_id: string
          shown_at?: string
          trigger_type: string
        }
        Update: {
          accepted?: boolean | null
          action_taken?: string
          confidence_score?: number
          conversion_value?: number | null
          converted?: boolean | null
          created_at?: string
          dismissed?: boolean | null
          id?: string
          restaurant_id?: string
          session_id?: string
          shown_at?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "intervention_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intervention_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "visit_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_interventions: {
        Row: {
          acknowledged_at: string | null
          action_type: string
          confidence_score: number
          converted: boolean
          created_at: string
          guest_id: string | null
          id: string
          opportunity_type: string
          reasoning_summary: string
          restaurant_id: string
          session_id: string
          status: string
        }
        Insert: {
          acknowledged_at?: string | null
          action_type?: string
          confidence_score: number
          converted?: boolean
          created_at?: string
          guest_id?: string | null
          id?: string
          opportunity_type: string
          reasoning_summary: string
          restaurant_id: string
          session_id: string
          status?: string
        }
        Update: {
          acknowledged_at?: string | null
          action_type?: string
          confidence_score?: number
          converted?: boolean
          created_at?: string
          guest_id?: string | null
          id?: string
          opportunity_type?: string
          reasoning_summary?: string
          restaurant_id?: string
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_interventions_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "session_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_interventions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_interventions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "visit_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          display_order: number
          id: string
          menu_id: string
          menu_type: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          menu_id: string
          menu_type?: string | null
          name?: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          menu_id?: string
          menu_type?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_discount_change_log: {
        Row: {
          actor_user_id: string
          created_at: string
          id: string
          menu_item_id: string
          new_value: Json
          old_value: Json
          restaurant_id: string
          source: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          id?: string
          menu_item_id: string
          new_value: Json
          old_value: Json
          restaurant_id: string
          source?: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          id?: string
          menu_item_id?: string
          new_value?: Json
          old_value?: Json
          restaurant_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_discount_change_log_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_discount_change_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          active: boolean | null
          ai_metadata: Json
          available: boolean
          category: string | null
          category_id: string
          deleted_at: string | null
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_featured: boolean
          name: string
          owner_id: string | null
          price: number | null
          restaurant_id: string | null
          special_enabled: boolean
          special_end_at: string | null
          special_no_expiry: boolean
          special_percent: number | null
          special_price: number | null
          special_start_at: string | null
          special_type: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          ai_metadata?: Json
          available?: boolean
          category?: string | null
          category_id: string
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_featured?: boolean
          name: string
          owner_id?: string | null
          price?: number | null
          restaurant_id?: string | null
          special_enabled?: boolean
          special_end_at?: string | null
          special_no_expiry?: boolean
          special_percent?: number | null
          special_price?: number | null
          special_start_at?: string | null
          special_type?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          ai_metadata?: Json
          available?: boolean
          category?: string | null
          category_id?: string
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_featured?: boolean
          name?: string
          owner_id?: string | null
          price?: number | null
          restaurant_id?: string | null
          special_enabled?: boolean
          special_end_at?: string | null
          special_no_expiry?: boolean
          special_percent?: number | null
          special_price?: number | null
          special_start_at?: string | null
          special_type?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_menu_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          active: boolean
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          image_url: string | null
          menu_type: string
          name: string
          owner_id: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          menu_type?: string
          name: string
          owner_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          menu_type?: string
          name?: string
          owner_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string | null
          effective_price_snapshot: number
          id: string
          line_total: number
          menu_item_id: string | null
          name_snapshot: string
          order_id: string
          price_snapshot: number
          quantity: number
          restaurant_id: string
          special_active_snapshot: boolean
          special_instructions: string | null
        }
        Insert: {
          created_at?: string | null
          effective_price_snapshot: number
          id?: string
          line_total: number
          menu_item_id?: string | null
          name_snapshot: string
          order_id: string
          price_snapshot: number
          quantity?: number
          restaurant_id: string
          special_active_snapshot?: boolean
          special_instructions?: string | null
        }
        Update: {
          created_at?: string | null
          effective_price_snapshot?: number
          id?: string
          line_total?: number
          menu_item_id?: string | null
          name_snapshot?: string
          order_id?: string
          price_snapshot?: number
          quantity?: number
          restaurant_id?: string
          special_active_snapshot?: boolean
          special_instructions?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          coupon_id: string | null
          created_at: string | null
          customer_name: string | null
          guest_id: string | null
          id: string
          idempotency_key: string
          kitchen_notes: string | null
          order_number: number
          order_origin: string
          preparing_at: string | null
          promotion_session_id: string | null
          ready_at: string | null
          restaurant_id: string
          session_id: string | null
          status: string
          subtotal: number
          table_identifier: string | null
          updated_at: string | null
          visit_session_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          coupon_id?: string | null
          created_at?: string | null
          customer_name?: string | null
          guest_id?: string | null
          id?: string
          idempotency_key: string
          kitchen_notes?: string | null
          order_number: number
          order_origin?: string
          preparing_at?: string | null
          promotion_session_id?: string | null
          ready_at?: string | null
          restaurant_id: string
          session_id?: string | null
          status?: string
          subtotal: number
          table_identifier?: string | null
          updated_at?: string | null
          visit_session_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          coupon_id?: string | null
          created_at?: string | null
          customer_name?: string | null
          guest_id?: string | null
          id?: string
          idempotency_key?: string
          kitchen_notes?: string | null
          order_number?: number
          order_origin?: string
          preparing_at?: string | null
          promotion_session_id?: string | null
          ready_at?: string | null
          restaurant_id?: string
          session_id?: string | null
          status?: string
          subtotal?: number
          table_identifier?: string | null
          updated_at?: string | null
          visit_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "session_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_visit_session_id_fkey"
            columns: ["visit_session_id"]
            isOneToOne: false
            referencedRelation: "visit_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          metadata: Json
          order_id: string | null
          provider: string
          restaurant_id: string
          status: string
          transaction_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          order_id?: string | null
          provider: string
          restaurant_id: string
          status?: string
          transaction_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          order_id?: string | null
          provider?: string
          restaurant_id?: string
          status?: string
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      play_sessions: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_profile_id: string | null
          expires_at: string | null
          id: string
          ip_address: string | null
          promotion_id: string
          selected_game_type: string
          session_token: string
          terms_accepted_timestamp: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_profile_id?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          promotion_id: string
          selected_game_type: string
          session_token: string
          terms_accepted_timestamp?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_profile_id?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          promotion_id?: string
          selected_game_type?: string
          session_token?: string
          terms_accepted_timestamp?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "play_sessions_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_sessions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
      promotion_game_assignments: {
        Row: {
          created_at: string
          enabled: boolean
          game_type: string
          id: string
          is_primary: boolean
          promotion_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          game_type: string
          id?: string
          is_primary?: boolean
          promotion_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          game_type?: string
          id?: string
          is_primary?: boolean
          promotion_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotion_game_assignments_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_rewards: {
        Row: {
          created_at: string | null
          custom_name: string | null
          daily_limit: number | null
          display_order: number | null
          id: string
          menu_item_id: string | null
          promotion_id: string
          restaurant_id: string
          reward_type: string
          reward_value: number | null
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          custom_name?: string | null
          daily_limit?: number | null
          display_order?: number | null
          id?: string
          menu_item_id?: string | null
          promotion_id: string
          restaurant_id: string
          reward_type?: string
          reward_value?: number | null
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          custom_name?: string | null
          daily_limit?: number | null
          display_order?: number | null
          id?: string
          menu_item_id?: string | null
          promotion_id?: string
          restaurant_id?: string
          reward_type?: string
          reward_value?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "promotion_rewards_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_rewards_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_rewards_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          coupon_expiry_minutes: number
          created_at: string | null
          daily_redeem_limit: number | null
          description: string | null
          ends_at: string | null
          game_type: string | null
          id: string
          max_spins: number | null
          menu_id: string | null
          name: string
          placement_mode: string
          public_url: string | null
          restaurant_id: string
          slug: string
          starts_at: string | null
          status: string
          stop_on_win: boolean | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          coupon_expiry_minutes?: number
          created_at?: string | null
          daily_redeem_limit?: number | null
          description?: string | null
          ends_at?: string | null
          game_type?: string | null
          id?: string
          max_spins?: number | null
          menu_id?: string | null
          name: string
          placement_mode?: string
          public_url?: string | null
          restaurant_id: string
          slug: string
          starts_at?: string | null
          status?: string
          stop_on_win?: boolean | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          coupon_expiry_minutes?: number
          created_at?: string | null
          daily_redeem_limit?: number | null
          description?: string | null
          ends_at?: string | null
          game_type?: string | null
          id?: string
          max_spins?: number | null
          menu_id?: string | null
          name?: string
          placement_mode?: string
          public_url?: string | null
          restaurant_id?: string
          slug?: string
          starts_at?: string | null
          status?: string
          stop_on_win?: boolean | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_capabilities: {
        Row: {
          capability_name: string
          created_at: string | null
          enabled: boolean
          id: string
          restaurant_id: string
        }
        Insert: {
          capability_name: string
          created_at?: string | null
          enabled?: boolean
          id?: string
          restaurant_id: string
        }
        Update: {
          capability_name?: string
          created_at?: string | null
          enabled?: boolean
          id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_capabilities_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_intelligence_profile: {
        Row: {
          brand_tone: string | null
          created_at: string
          cuisine_type: string | null
          customer_demographic: string | null
          id: string
          price_range: string | null
          restaurant_id: string
          restaurant_style: string | null
          service_style: string | null
          target_customer: string | null
          updated_at: string
        }
        Insert: {
          brand_tone?: string | null
          created_at?: string
          cuisine_type?: string | null
          customer_demographic?: string | null
          id?: string
          price_range?: string | null
          restaurant_id: string
          restaurant_style?: string | null
          service_style?: string | null
          target_customer?: string | null
          updated_at?: string
        }
        Update: {
          brand_tone?: string | null
          created_at?: string
          cuisine_type?: string | null
          customer_demographic?: string | null
          id?: string
          price_range?: string | null
          restaurant_id?: string
          restaurant_style?: string | null
          service_style?: string | null
          target_customer?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_intelligence_profile_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_menu_assignments: {
        Row: {
          active: boolean
          active_days: number[] | null
          active_end_time: string | null
          active_start_time: string | null
          created_at: string
          display_order: number
          id: string
          menu_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          active_days?: number[] | null
          active_end_time?: string | null
          active_start_time?: string | null
          created_at?: string
          display_order?: number
          id?: string
          menu_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          active_days?: number[] | null
          active_end_time?: string | null
          active_start_time?: string | null
          created_at?: string
          display_order?: number
          id?: string
          menu_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_menu_assignments_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_menu_assignments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_order_counters: {
        Row: {
          last_order_number: number
          restaurant_id: string
        }
        Insert: {
          last_order_number?: number
          restaurant_id: string
        }
        Update: {
          last_order_number?: number
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_order_counters_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          restaurant_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          restaurant_id: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          restaurant_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_touchpoints: {
        Row: {
          active: boolean
          capacity: number | null
          created_at: string | null
          deleted_at: string | null
          display_order: number
          id: string
          name: string
          occupancy_status: string | null
          restaurant_id: string
          section_name: string | null
          touchpoint_code: string
          type: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          capacity?: number | null
          created_at?: string | null
          deleted_at?: string | null
          display_order?: number
          id?: string
          name: string
          occupancy_status?: string | null
          restaurant_id: string
          section_name?: string | null
          touchpoint_code: string
          type?: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          capacity?: number | null
          created_at?: string | null
          deleted_at?: string | null
          display_order?: number
          id?: string
          name?: string
          occupancy_status?: string | null
          restaurant_id?: string
          section_name?: string | null
          touchpoint_code?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_touchpoints_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          accent_color: string | null
          address_line1: string | null
          average_ticket: string | null
          brand_color: string | null
          city: string | null
          contact_email: string | null
          country: string | null
          created_at: string | null
          cuisine_type: string | null
          current_promotion_id: string | null
          deleted_at: string | null
          description: string | null
          experience_mode: string
          facebook_url: string | null
          google_maps_url: string | null
          hero_image_url: string | null
          hours: Json | null
          id: string
          image_url: string | null
          instagram_url: string | null
          location_count: number | null
          logo_url: string | null
          main_goal: string | null
          name: string
          owner_id: string | null
          owner_name: string | null
          phone: string | null
          pos_system: string | null
          postal_code: string | null
          province_state: string | null
          secondary_color: string | null
          slug: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          accent_color?: string | null
          address_line1?: string | null
          average_ticket?: string | null
          brand_color?: string | null
          city?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string | null
          cuisine_type?: string | null
          current_promotion_id?: string | null
          deleted_at?: string | null
          description?: string | null
          experience_mode?: string
          facebook_url?: string | null
          google_maps_url?: string | null
          hero_image_url?: string | null
          hours?: Json | null
          id?: string
          image_url?: string | null
          instagram_url?: string | null
          location_count?: number | null
          logo_url?: string | null
          main_goal?: string | null
          name: string
          owner_id?: string | null
          owner_name?: string | null
          phone?: string | null
          pos_system?: string | null
          postal_code?: string | null
          province_state?: string | null
          secondary_color?: string | null
          slug: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          accent_color?: string | null
          address_line1?: string | null
          average_ticket?: string | null
          brand_color?: string | null
          city?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string | null
          cuisine_type?: string | null
          current_promotion_id?: string | null
          deleted_at?: string | null
          description?: string | null
          experience_mode?: string
          facebook_url?: string | null
          google_maps_url?: string | null
          hero_image_url?: string | null
          hours?: Json | null
          id?: string
          image_url?: string | null
          instagram_url?: string | null
          location_count?: number | null
          logo_url?: string | null
          main_goal?: string | null
          name?: string
          owner_id?: string | null
          owner_name?: string | null
          phone?: string | null
          pos_system?: string | null
          postal_code?: string | null
          province_state?: string | null
          secondary_color?: string | null
          slug?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurants_current_promotion_id_fkey"
            columns: ["current_promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          discount_value: string | null
          display_order: number | null
          id: string
          label: string
          promotion_id: string | null
          restaurant_id: string | null
          weight: number
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          discount_value?: string | null
          display_order?: number | null
          id?: string
          label: string
          promotion_id?: string | null
          restaurant_id?: string | null
          weight?: number
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          discount_value?: string | null
          display_order?: number | null
          id?: string
          label?: string
          promotion_id?: string | null
          restaurant_id?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "rewards_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      session_events: {
        Row: {
          created_at: string
          event_type: string
          guest_id: string | null
          id: string
          menu_item_id: string | null
          metadata: Json
          promotion_id: string | null
          restaurant_id: string
          session_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          guest_id?: string | null
          id?: string
          menu_item_id?: string | null
          metadata?: Json
          promotion_id?: string | null
          restaurant_id: string
          session_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          guest_id?: string | null
          id?: string
          menu_item_id?: string | null
          metadata?: Json
          promotion_id?: string | null
          restaurant_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_events_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_events_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "visit_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_guests: {
        Row: {
          device_fingerprint: string
          guest_name: string | null
          guest_token: string
          id: string
          joined_at: string
          last_seen_at: string
          restaurant_id: string
          session_id: string
          status: string
          user_agent: string | null
        }
        Insert: {
          device_fingerprint: string
          guest_name?: string | null
          guest_token: string
          id?: string
          joined_at?: string
          last_seen_at?: string
          restaurant_id: string
          session_id: string
          status?: string
          user_agent?: string | null
        }
        Update: {
          device_fingerprint?: string
          guest_name?: string | null
          guest_token?: string
          id?: string
          joined_at?: string
          last_seen_at?: string
          restaurant_id?: string
          session_id?: string
          status?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_guests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_guests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "visit_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content: {
        Row: {
          created_at: string
          field_key: string
          field_type: string
          id: string
          is_active: boolean
          label: string
          page_key: string
          section_key: string
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          field_key: string
          field_type?: string
          id?: string
          is_active?: boolean
          label: string
          page_key: string
          section_key: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Update: {
          created_at?: string
          field_key?: string
          field_type?: string
          id?: string
          is_active?: boolean
          label?: string
          page_key?: string
          section_key?: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      site_media: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          media_type: string
          page_key: string
          section_key: string
          title: string | null
          updated_at: string
          youtube_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          media_type?: string
          page_key: string
          section_key: string
          title?: string | null
          updated_at?: string
          youtube_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          media_type?: string
          page_key?: string
          section_key?: string
          title?: string | null
          updated_at?: string
          youtube_url?: string | null
        }
        Relationships: []
      }
      visit_sessions: {
        Row: {
          assigned_ai_agent: string | null
          coupons_issued: number
          created_at: string
          ended_at: string | null
          ended_by: string | null
          guest_count: number
          id: string
          last_activity_at: string
          last_promotion_played: string | null
          menu_items_viewed: number
          orders_count: number
          promotion_interactions: number
          restaurant_id: string
          session_access_code: string
          session_interaction_log: Json
          started_at: string
          status: string
          total_spend: number
          touchpoint_id: string
          updated_at: string
        }
        Insert: {
          assigned_ai_agent?: string | null
          coupons_issued?: number
          created_at?: string
          ended_at?: string | null
          ended_by?: string | null
          guest_count?: number
          id?: string
          last_activity_at?: string
          last_promotion_played?: string | null
          menu_items_viewed?: number
          orders_count?: number
          promotion_interactions?: number
          restaurant_id: string
          session_access_code: string
          session_interaction_log?: Json
          started_at?: string
          status?: string
          total_spend?: number
          touchpoint_id: string
          updated_at?: string
        }
        Update: {
          assigned_ai_agent?: string | null
          coupons_issued?: number
          created_at?: string
          ended_at?: string | null
          ended_by?: string | null
          guest_count?: number
          id?: string
          last_activity_at?: string
          last_promotion_played?: string | null
          menu_items_viewed?: number
          orders_count?: number
          promotion_interactions?: number
          restaurant_id?: string
          session_access_code?: string
          session_interaction_log?: Json
          started_at?: string
          status?: string
          total_spend?: number
          touchpoint_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_sessions_last_promotion_played_fkey"
            columns: ["last_promotion_played"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_sessions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_sessions_touchpoint_id_fkey"
            columns: ["touchpoint_id"]
            isOneToOne: false
            referencedRelation: "restaurant_touchpoints"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_prompt_version: {
        Args: { p_feature_key: string; p_template_id: string }
        Returns: undefined
      }
      append_session_interaction: {
        Args: { p_event: Json; p_session_id: string }
        Returns: undefined
      }
      disconnect_session_guests: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      increment_guest_count: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      increment_session_counters: {
        Args: {
          p_coupons_delta?: number
          p_menu_items_viewed_delta?: number
          p_orders_delta?: number
          p_promotion_delta?: number
          p_session_id: string
          p_spend_delta?: number
        }
        Returns: undefined
      }
      is_super_admin: { Args: never; Returns: boolean }
      mark_stale_sessions_abandoned: {
        Args: { p_restaurant_id: string; p_timeout_hours?: number }
        Returns: number
      }
      next_order_number: { Args: { p_restaurant_id: string }; Returns: number }
      refund_image_generation_credit: {
        Args: { p_restaurant_id: string }
        Returns: undefined
      }
      reserve_image_generation_credit: {
        Args: { p_restaurant_id: string }
        Returns: boolean
      }
      soft_delete_restaurant: {
        Args: { target_restaurant_id: string }
        Returns: undefined
      }
      update_stale_guest_presence: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      user_owns_menu: { Args: { p_menu_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
