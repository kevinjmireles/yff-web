# Legal Compliance & Operations Runbook

## Legal Checklist

### ✅ **Completed Legal Requirements**
- [x] **Privacy Policy** - Created `/privacy-policy` page with comprehensive privacy information
- [x] **Terms of Service** - Created `/terms-of-service` page with liability protection and disclaimers
- [x] **Copyright Notice** - Updated footer to show "© 2025 Cut CO2 LLC. All rights reserved."
- [x] **Contact Information** - Both legal pages use `info@myrepresentatives.com`
- [x] **Disclaimer Clause** - "deemed reliable but not guaranteed" protection included
- [x] **Governing Law** - Set to Ohio jurisdiction

### 🔄 **Pending Legal Items**
- [ ] **Cookie Policy** - If implementing analytics or tracking
- [ ] **GDPR Compliance** - If serving EU users
- [ **Data Processing Agreements** - With service providers (Supabase, Make.com)
- [ ] **Accessibility Statement** - WCAG compliance documentation

### 📋 **Legal Page URLs**
- **Privacy Policy**: `/privacy-policy`
- **Terms of Service**: `/terms-of-service`
- **Footer Links**: Both legal pages accessible from site footer

---

## Operations Runbook

### 🚀 **Deployment Checklist**
- [x] **Environment Variables** - Configured for Vercel deployment
- [x] **reCAPTCHA Setup** - Optional in development, required in production
- [x] **Make.com Webhook** - Configured for signup forwarding
- [x] **Rate Limiting** - Implemented (5 requests/minute per IP)
- [x] **Error Handling** - 404, 500, and global error pages created

### 🔧 **Maintenance Tasks**
- [ ] **SSL Certificate Renewal** - Monitor Vercel SSL status
- [ ] **Dependency Updates** - Regular security updates for packages
- [ ] **Database Backups** - Supabase automated backups
- [ ] **Log Monitoring** - Review API access logs for abuse

### 🚨 **Incident Response**
1. **Service Outage**
   - Check Vercel status page
   - Verify environment variables
   - Check Supabase service status

2. **Security Breach**
   - Rotate API keys immediately
   - Review access logs
   - Update affected users

3. **Legal Request**
   - Document request details
   - Consult legal counsel if needed
   - Respond within required timeframe

### 📊 **Monitoring & Metrics**
- **Health Check**: `/api/health` endpoint
- **Signup Success Rate**: Monitor `/api/signup` responses
- **Rate Limiting**: Track 429 responses
- **Page Load Times**: Vercel analytics

### 🔐 **Security Measures**
- **Rate Limiting**: Prevents API abuse
- **reCAPTCHA**: Optional spam protection
- **Input Validation**: Server-side validation on all forms
- **HTTPS Only**: Enforced by Vercel
- **No Secrets in Code**: All sensitive data in environment variables

---

## Contact Information

**Legal Inquiries**: info@myrepresentatives.com  
**Technical Support**: info@myrepresentatives.com  
**Emergency Contact**: [Add emergency contact information]

---

*Last Updated: January 2025*  
*Next Review: Quarterly*
