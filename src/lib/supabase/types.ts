export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          balance: number;
          kind: string;
          label: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          balance?: number;
          kind: string;
          label: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          balance?: number;
          kind?: string;
          label?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'accounts_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: {
          event_type: string;
          id: number;
          ip_address: unknown;
          metadata: Json;
          occurred_at: string;
          user_agent: string | null;
          user_id: string | null;
          workspace_id: string | null;
        };
        Insert: {
          event_type: string;
          id?: number;
          ip_address?: unknown;
          metadata?: Json;
          occurred_at?: string;
          user_agent?: string | null;
          user_id?: string | null;
          workspace_id?: string | null;
        };
        Update: {
          event_type?: string;
          id?: number;
          ip_address?: unknown;
          metadata?: Json;
          occurred_at?: string;
          user_agent?: string | null;
          user_id?: string | null;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_log_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      categories: {
        Row: {
          color: string | null;
          created_at: string;
          created_by: string;
          icon: string | null;
          id: string;
          kind: string;
          name: string;
          workspace_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          created_by: string;
          icon?: string | null;
          id?: string;
          kind: string;
          name: string;
          workspace_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          created_by?: string;
          icon?: string | null;
          id?: string;
          kind?: string;
          name?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'categories_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'categories_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      charges: {
        Row: {
          amount: number;
          category_id: string | null;
          created_at: string;
          created_by: string;
          due_month: number;
          frequency: string;
          id: string;
          is_active: boolean;
          label: string;
          notes: string | null;
          paid_from: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          amount: number;
          category_id?: string | null;
          created_at?: string;
          created_by: string;
          due_month: number;
          frequency: string;
          id?: string;
          is_active?: boolean;
          label: string;
          notes?: string | null;
          paid_from?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          amount?: number;
          category_id?: string | null;
          created_at?: string;
          created_by?: string;
          due_month?: number;
          frequency?: string;
          id?: string;
          is_active?: boolean;
          label?: string;
          notes?: string | null;
          paid_from?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'charges_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'charges_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'charges_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      deletion_requests: {
        Row: {
          cancelled_at: string | null;
          completed_at: string | null;
          id: string;
          reason: string | null;
          requested_at: string;
          scheduled_for: string;
          status: string;
          user_id: string;
        };
        Insert: {
          cancelled_at?: string | null;
          completed_at?: string | null;
          id?: string;
          reason?: string | null;
          requested_at?: string;
          scheduled_for: string;
          status?: string;
          user_id: string;
        };
        Update: {
          cancelled_at?: string | null;
          completed_at?: string | null;
          id?: string;
          reason?: string | null;
          requested_at?: string;
          scheduled_for?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'deletion_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      expenses: {
        Row: {
          amount: number;
          category_id: string | null;
          created_at: string;
          created_by: string;
          id: string;
          label: string;
          note: string | null;
          occurred_on: string;
          paid_from: string;
          workspace_id: string;
        };
        Insert: {
          amount: number;
          category_id?: string | null;
          created_at?: string;
          created_by: string;
          id?: string;
          label: string;
          note?: string | null;
          occurred_on: string;
          paid_from?: string;
          workspace_id: string;
        };
        Update: {
          amount?: number;
          category_id?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          label?: string;
          note?: string | null;
          occurred_on?: string;
          paid_from?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'expenses_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      user_consents: {
        Row: {
          granted: boolean;
          granted_at: string | null;
          ip_address: unknown;
          revoked_at: string | null;
          scope: string;
          user_agent: string | null;
          user_id: string;
          version: string;
        };
        Insert: {
          granted: boolean;
          granted_at?: string | null;
          ip_address?: unknown;
          revoked_at?: string | null;
          scope: string;
          user_agent?: string | null;
          user_id: string;
          version: string;
        };
        Update: {
          granted?: boolean;
          granted_at?: string | null;
          ip_address?: unknown;
          revoked_at?: string | null;
          scope?: string;
          user_agent?: string | null;
          user_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_consents_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          created_at: string;
          display_name: string | null;
          email: string;
          id: string;
          locale: string;
          onboarded_at: string | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          email: string;
          id: string;
          locale?: string;
          onboarded_at?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          email?: string;
          id?: string;
          locale?: string;
          onboarded_at?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      workspace_members: {
        Row: {
          joined_at: string;
          role: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          joined_at?: string;
          role: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          joined_at?: string;
          role?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_members_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_settings: {
        Row: {
          months_tracked: number | null;
          provision_target: number | null;
          savings_balance: number | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          months_tracked?: number | null;
          provision_target?: number | null;
          savings_balance?: number | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          months_tracked?: number | null;
          provision_target?: number | null;
          savings_balance?: number | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_settings_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: true;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          currency: string;
          fiscal_month_start: number;
          id: string;
          monthly_income: number | null;
          name: string;
          owner_id: string;
          updated_at: string;
          vie_courante_monthly_transfer: number | null;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          fiscal_month_start?: number;
          id?: string;
          monthly_income?: number | null;
          name: string;
          owner_id: string;
          updated_at?: string;
          vie_courante_monthly_transfer?: number | null;
        };
        Update: {
          created_at?: string;
          currency?: string;
          fiscal_month_start?: number;
          id?: string;
          monthly_income?: number | null;
          name?: string;
          owner_id?: string;
          updated_at?: string;
          vie_courante_monthly_transfer?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workspaces_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      assert_rls_coverage: {
        Args: never;
        Returns: {
          rls_enabled: boolean;
          rls_forced: boolean;
          schema_name: string;
          table_name: string;
        }[];
      };
      is_workspace_editor: { Args: { ws_id: string }; Returns: boolean };
      is_workspace_member: { Args: { ws_id: string }; Returns: boolean };
      purge_audit_log_older_than_12_months: { Args: never; Returns: number };
      seed_default_accounts: { Args: { ws_id: string }; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
