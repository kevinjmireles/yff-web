// Purpose: Test Zod schemas for validation.
// Called by: vitest test runner.
// Tests: Input validation for signup and admin trigger schemas.

import { describe, it, expect } from 'vitest';
import { signupSchema, adminTriggerSchema } from '../lib/schema';

describe('Zod Schemas', () => {
  describe('signupSchema', () => {
    it('validates valid signup data', () => {
      const validData = {
        email: 'test@example.com',
        zipcode: '12345'
      };
      
      const result = signupSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('validates signup data without zipcode', () => {
      const validData = {
        email: 'test@example.com'
      };
      
      const result = signupSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const invalidData = {
        email: 'not-an-email',
        zipcode: '12345'
      };
      
      const result = signupSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('adminTriggerSchema', () => {
    it('validates valid admin trigger data', () => {
      const validData = {
        campaign_tag: 'test-campaign',
        subject: 'Test Subject',
        body_template_id: 'template-123'
      };
      
      const result = adminTriggerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('validates admin trigger data with optional fields', () => {
      const validData = {
        campaign_tag: 'test-campaign',
        subject: 'Test Subject',
        body_template_id: 'template-123',
        audience_filter: { state: 'CA' },
        test_recipients: ['test@example.com']
      };
      
      const result = adminTriggerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('rejects missing required fields', () => {
      const invalidData = {
        campaign_tag: 'test-campaign'
        // missing subject and body_template_id
      };
      
      const result = adminTriggerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});
