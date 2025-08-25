import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email(),
  zipcode: z.string().min(3).max(10).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const adminTriggerSchema = z.object({
  campaign_tag: z.string().min(1),
  subject: z.string().min(1),
  body_template_id: z.string().min(1),
  audience_filter: z.record(z.any()).optional(),
  test_recipients: z.array(z.string().email()).optional(),
});
export type AdminTriggerInput = z.infer<typeof adminTriggerSchema>;

// Legacy alias for backward compatibility
export const campaignSchema = adminTriggerSchema;
export type CampaignInput = AdminTriggerInput;

