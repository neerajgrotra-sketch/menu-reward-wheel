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
      menu_items: {
        Row: {
          active: boolean | null
          ai_metadata: Json
          available: boolean
          category: string | null
          deleted_at: string | null
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_featured: boolean
          menu_id: string
          name: string
          owner_id: string | null
          price: number | null
          restaurant_id: string | null
          section_id: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          ai_metadata?: Json
          available?: boolean
          category?: string | null
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_featured?: boolean
          menu_id: string
          name: string
          owner_id?: string | null
          price?: number | null
          restaurant_id?: string | null
          section_id?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          ai_metadata?: Json
          available?: boolean
          category?: string | null
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_featured?: boolean
          menu_id?: string
          name?: string
          owner_id?: string | null
          price?: number | null
          restaurant_id?: string | null
          section_id?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "menu_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_sections: {
        Row: {
          active: boolean
          created_at: string
          deleted_at: string | null
          description: string | null
          display_order: number
          id: string
          menu_id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          menu_id: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          menu_id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_sections_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_sections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          display_order: number
          id: string
          menu_type: string | null
          name: string
          restaurant_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          menu_type?: string | null
          name?: string
          restaurant_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          menu_type?: string | null
          name?: string
          restaurant_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_restaurant_id_fkey"
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
          promotion_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          game_type: string
          id?: string
          promotion_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          game_type?: string
          id?: string
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
            referencedRelation: "menus"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_prompt_version: {
        Args: { p_feature_key: string; p_template_id: string }
        Returns: undefined
      }
      delete_promotion_cascade: {
        Args: { target_promotion_id: string }
        Returns: undefined
      }
      delete_restaurant_cascade: {
        Args: { target_restaurant_id: string }
        Returns: undefined
      }
      is_super_admin: { Args: never; Returns: boolean }
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
