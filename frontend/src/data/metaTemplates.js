export const META_TEMPLATES_LIBRARY = [
  {
    id: 'meta-ac-1',
    name: 'account_creation_confirmation_3',
    displayName: 'Account Creation Confirmation 3',
    category: 'UTILITY',
    useCase: 'ACCOUNT_UPDATES',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, Your new account has been created successfully. Please verify {{2}} to complete your profile.',
        example: { body_text: [['John', 'email/phone number']] }
      }
    ]
  },
  {
    id: 'meta-addr-1',
    name: 'address_update',
    displayName: 'Address Update',
    category: 'UTILITY',
    useCase: 'ORDER_MANAGEMENT',
    industry: 'E-commerce',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your delivery address has been successfully updated to {{2}}. Contact {{3}} for any inquiries.',
        example: { body_text: [['John', '123 Main St, New York', '+16505551234']] }
      }
    ]
  },
  {
    id: 'meta-appt-1',
    name: 'appointment_cancelled',
    displayName: 'Appointment Cancelled',
    category: 'UTILITY',
    useCase: 'EVENT_REMINDER',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, Your appointment on {{2}} has been cancelled. We hope to see you another time.',
        example: { body_text: [['John', 'June 20th']] }
      }
    ]
  },
  {
    id: 'meta-appt-2',
    name: 'appointment_confirmation_1',
    displayName: 'Appointment Confirmation 1',
    category: 'UTILITY',
    useCase: 'EVENT_REMINDER',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hello {{1}}, Thank you for booking with {{2}}. Your appointment for {{3}} on {{4}} at {{5}} is confirmed.',
        example: { body_text: [['John', 'GAP Clinic', 'Checkup', 'June 20th', '10:00 AM']] }
      }
    ]
  },
  {
    id: 'meta-appt-3',
    name: 'appointment_reminder',
    displayName: 'Appointment Reminder',
    category: 'UTILITY',
    useCase: 'EVENT_REMINDER',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, this is a friendly reminder that you have an upcoming appointment with {{2}} on {{3}} at {{4}} local time.',
        example: { body_text: [['John', 'Dr. Smith', 'June 21st', '2:30 PM']] }
      }
    ]
  },
  {
    id: 'meta-otp-1',
    name: 'otp_verification_code',
    displayName: 'OTP Verification Code',
    category: 'AUTHENTICATION',
    useCase: 'OTP',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: '{{1}} is your verification code. For security, do not share this code with anyone.',
        example: { body_text: [['483920']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'COPY_CODE', text: 'Copy Code' }
        ]
      }
    ]
  },
  {
    id: 'meta-order-1',
    name: 'order_confirmation',
    displayName: 'Order Confirmation',
    category: 'UTILITY',
    useCase: 'ORDER_MANAGEMENT',
    industry: 'E-commerce',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, thank you for your order! Your order #{{2}} of {{3}} has been confirmed and is being processed.',
        example: { body_text: [['John', '10042', 'Leather Jacket']] }
      }
    ]
  },
  {
    id: 'meta-order-2',
    name: 'order_dispatched',
    displayName: 'Order Dispatched',
    category: 'UTILITY',
    useCase: 'ORDER_MANAGEMENT',
    industry: 'E-commerce',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hello {{1}}, your order #{{2}} has been shipped and is on its way. Track your order status below.',
        example: { body_text: [['John', '10042']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Track Order', url: 'https://example.com/track' }
        ]
      }
    ]
  },
  {
    id: 'meta-order-3',
    name: 'delivery_completed',
    displayName: 'Delivery Completed',
    category: 'UTILITY',
    useCase: 'ORDER_MANAGEMENT',
    industry: 'E-commerce',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your order #{{2}} has been successfully delivered to {{3}}. Thank you for shopping with us!',
        example: { body_text: [['John', '10042', '123 Main St']] }
      }
    ]
  },
  {
    id: 'meta-cart-1',
    name: 'cart_abandonment_reminder',
    displayName: 'Cart Abandonment',
    category: 'MARKETING',
    useCase: 'MARKETING_CAMPAIGNS',
    industry: 'E-commerce',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, you left items in your cart! Complete your purchase today using code {{2}} to get a {{3}} discount.',
        example: { body_text: [['John', 'SAVE10', '10%']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Checkout Now', url: 'https://example.com/checkout' }
        ]
      }
    ]
  },
  {
    id: 'meta-promo-1',
    name: 'welcome_offer_code',
    displayName: 'Welcome Offer Code',
    category: 'MARKETING',
    useCase: 'MARKETING_CAMPAIGNS',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, welcome to {{2}}! As a special thanks, enjoy {{3}} off your first order with code {{4}} at checkout.',
        example: { body_text: [['John', 'GAP Brand', '$10', 'WELCOME10']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Shop Now', url: 'https://example.com/shop' }
        ]
      }
    ]
  },
  {
    id: 'meta-re-1',
    name: 'site_visit_schedule',
    displayName: 'Site Visit Schedule',
    category: 'UTILITY',
    useCase: 'EVENT_REMINDER',
    industry: 'Real Estate',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Dear {{1}}, this is to confirm your site visit for {{2}} on {{3}} at {{4}}. Our representative will assist you.',
        example: { body_text: [['John', 'Skyline Apartments', 'June 20th', '11:00 AM']] }
      }
    ]
  },
  {
    id: 'meta-re-2',
    name: 'payment_installment_reminder',
    displayName: 'Installment Reminder',
    category: 'UTILITY',
    useCase: 'ACCOUNT_UPDATES',
    industry: 'Real Estate',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hello {{1}}, this is a reminder that your payment installment of {{2}} for {{3}} is due on {{4}}. Pay securely below.',
        example: { body_text: [['John', '$5,000', 'Oceanview Villa', 'June 25th']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Pay Invoice', url: 'https://example.com/pay' }
        ]
      }
    ]
  },
  {
    id: 'meta-fin-1',
    name: 'billing_invoice_ready',
    displayName: 'Invoice Ready',
    category: 'UTILITY',
    useCase: 'ACCOUNT_UPDATES',
    industry: 'Finance',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your invoice #{{2}} for {{3}} is now ready. The amount due is {{4}}, payable by {{5}}. Download below.',
        example: { body_text: [['John', 'INV-8832', 'GAP Services', '$120.00', 'June 30th']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'View Invoice', url: 'https://example.com/invoice' }
        ]
      }
    ]
  },
  {
    id: 'meta-fin-2',
    name: 'refund_confirmation',
    displayName: 'Refund Confirmed',
    category: 'UTILITY',
    useCase: 'ACCOUNT_UPDATES',
    industry: 'Finance',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, we\'ve processed a refund of {{2}} for order #{{3}}. It should reflect in your account within {{4}} business days.',
        example: { body_text: [['John', '$80.00', '10042', '3-5']] }
      }
    ]
  },
  {
    id: 'meta-hc-1',
    name: 'lab_report_ready',
    displayName: 'Lab Report Ready',
    category: 'UTILITY',
    useCase: 'CUSTOMER_CARE',
    industry: 'Healthcare',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Dear {{1}}, your lab test results for {{2}} are now ready. Please use the secure link below to download your report.',
        example: { body_text: [['John', 'Blood Profile']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Download Report', url: 'https://example.com/reports' }
        ]
      }
    ]
  },
  {
    id: 'meta-hc-2',
    name: 'prescription_refill',
    displayName: 'Prescription Refill',
    category: 'UTILITY',
    useCase: 'CUSTOMER_CARE',
    industry: 'Healthcare',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your prescription for {{2}} is ready for pickup at {{3}}. Please bring a valid ID.',
        example: { body_text: [['John', 'Aspirin', 'Main Street Pharmacy']] }
      }
    ]
  },
  {
    id: 'meta-edu-1',
    name: 'webinar_registration',
    displayName: 'Webinar Registration',
    category: 'UTILITY',
    useCase: 'EVENT_REMINDER',
    industry: 'Education',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Thank you for registering, {{1}}! Your spot is confirmed for the {{2}} webinar on {{3}} at {{4}}. Join using the link.',
        example: { body_text: [['John', 'AI Marketing', 'June 22nd', '4:00 PM']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Join Webinar', url: 'https://example.com/join' }
        ]
      }
    ]
  },
  {
    id: 'meta-edu-2',
    name: 'course_enrollment_welcome',
    displayName: 'Course Enrollment Welcome',
    category: 'MARKETING',
    useCase: 'MARKETING_CAMPAIGNS',
    industry: 'Education',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Welcome, {{1}}! You have successfully enrolled in {{2}}. Start learning now by logging into the portal.',
        example: { body_text: [['John', 'Python Basics']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Go to Course', url: 'https://example.com/learn' }
        ]
      }
    ]
  },
  {
    id: 'meta-cc-1',
    name: 'feedback_survey_rating',
    displayName: 'Feedback Survey Rating',
    category: 'MARKETING',
    useCase: 'CUSTOMER_CARE',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, thank you for choosing {{2}}! How would you rate our service today? Please select an option below.',
        example: { body_text: [['John', 'GAP Services']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Great Service' },
          { type: 'QUICK_REPLY', text: 'Average' },
          { type: 'QUICK_REPLY', text: 'Needs Improvement' }
        ]
      }
    ]
  },
  {
    id: 'meta-cc-2',
    name: 'ticket_resolved_notification',
    displayName: 'Support Ticket Resolved',
    category: 'UTILITY',
    useCase: 'CUSTOMER_CARE',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your support ticket #{{2}} regarding {{3}} has been resolved. Reply to this chat if you have further questions.',
        example: { body_text: [['John', 'T-4982', 'Login Issue']] }
      }
    ]
  },
  {
    id: 'meta-cc-3',
    name: 'account_suspension_alert',
    displayName: 'Account Suspension Alert',
    category: 'UTILITY',
    useCase: 'ACCOUNT_UPDATES',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Important: Hi {{1}}, your account on {{2}} has been temporarily suspended due to {{3}}. Please contact support.',
        example: { body_text: [['John', 'GAP portal', 'unusual activity']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'PHONE_NUMBER', text: 'Call Support', phone_number: '+16505551234' }
        ]
      }
    ]
  },
  {
    id: 'meta-img-1',
    name: 'seasonal_sale_promotion',
    displayName: 'Seasonal Sale Promotion (Image)',
    category: 'MARKETING',
    useCase: 'MARKETING_CAMPAIGNS',
    industry: 'E-commerce',
    language: 'en_US',
    components: [
      {
        type: 'HEADER',
        format: 'IMAGE',
        example: { header_handle: ['https://example.com/sale_banner.jpg'] }
      },
      {
        type: 'BODY',
        text: 'Hi {{1}}! 🎉 Our biggest sale of the season is here. Enjoy up to {{2}} off on all your favorite items. Tap below to shop now!',
        example: { body_text: [['John', '50%']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Shop the Sale', url: 'https://example.com/sale' }
        ]
      }
    ]
  },
  {
    id: 'meta-img-2',
    name: 'new_collection_launch',
    displayName: 'New Collection Launch (Image)',
    category: 'MARKETING',
    useCase: 'MARKETING_CAMPAIGNS',
    industry: 'Retail',
    language: 'en_US',
    components: [
      {
        type: 'HEADER',
        format: 'IMAGE',
        example: { header_handle: ['https://example.com/new_collection.jpg'] }
      },
      {
        type: 'BODY',
        text: 'Hey {{1}}, be the first to check out our exclusive new collection! ✨ Discover the latest trends starting at just {{2}}. Limited stock available.',
        example: { body_text: [['John', '$29']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'View Collection', url: 'https://example.com/new-collection' }
        ]
      }
    ]
  },
  {
    id: 'meta-img-3',
    name: 'festival_greeting_offer',
    displayName: 'Festival Greeting & Offer (Image)',
    category: 'MARKETING',
    useCase: 'MARKETING_CAMPAIGNS',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'HEADER',
        format: 'IMAGE',
        example: { header_handle: ['https://example.com/festival_greeting.jpg'] }
      },
      {
        type: 'BODY',
        text: 'Wishing you a very Happy {{1}}, {{2}}! 🌟 To celebrate, we are gifting you a special {{3}} discount code: {{4}}. Valid for 48 hours only.',
        example: { body_text: [['Diwali', 'John', '20%', 'FEST20']] }
      },
      {
        type: 'FOOTER',
        text: 'Reply STOP to opt out'
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Claim Offer', url: 'https://example.com/offer' }
        ]
      }
    ]
  },
  {
    id: 'meta-loyalty-1',
    name: 'loyalty_reward_available',
    displayName: 'Loyalty Reward Available',
    category: 'MARKETING',
    useCase: 'LOYALTY_PROGRAM',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, thanks for being a valued customer! 🎉 You have unlocked a reward worth {{2}}. Claim it before {{3}}.',
        example: { body_text: [['John', '$20', 'July 30']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Claim Reward', url: 'https://example.com/reward' }
        ]
      }
    ]
  },
  {
    id: 'meta-reengage-1',
    name: 'we_miss_you_offer',
    displayName: 'We Miss You',
    category: 'MARKETING',
    useCase: 'RE_ENGAGEMENT',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, its been a while! Wed love to welcome you back with an exclusive {{2}} discount available until {{3}}.',
        example: { body_text: [['John', '20%', 'Friday']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Come Back', url: 'https://example.com' }
        ]
      }
    ]
  },
  {
    id: 'meta-stock-1',
    name: 'back_in_stock',
    displayName: 'Back In Stock',
    category: 'MARKETING',
    useCase: 'PRODUCT_UPDATES',
    industry: 'Retail',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Good news {{1}}! 🎉 {{2}} is back in stock. Limited quantities available.',
        example: { body_text: [['John', 'Wireless Headphones']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Buy Now', url: 'https://example.com' }
        ]
      }
    ]
  },
  {
    id: 'meta-price-1',
    name: 'price_drop_alert',
    displayName: 'Price Drop Alert',
    category: 'MARKETING',
    useCase: 'PRODUCT_UPDATES',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, great news! The price of {{2}} has dropped to {{3}}. Grab yours before the offer ends.',
        example: { body_text: [['John', 'Smart Watch', '$99']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Shop Now', url: 'https://example.com' }
        ]
      }
    ]
  },
  {
    id: 'meta-lead-1',
    name: 'free_consultation_invite',
    displayName: 'Free Consultation',
    category: 'MARKETING',
    useCase: 'LEAD_NURTURING',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hello {{1}}, lets discuss how we can help you achieve your goals. Book your free {{2}} consultation today.',
        example: { body_text: [['John', '30-minute']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Book Consultation', url: 'https://example.com/book' }
        ]
      }
    ]
  },
  {
    id: 'meta-demo-1',
    name: 'product_demo_invitation',
    displayName: 'Product Demo Invitation',
    category: 'MARKETING',
    useCase: 'LEAD_NURTURING',
    industry: 'SaaS',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, discover how {{2}} can simplify your work. Schedule a personalized live demo today.',
        example: { body_text: [['John', 'FlowPilot']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Schedule Demo', url: 'https://example.com/demo' }
        ]
      }
    ]
  },
  {
    id: 'meta-event-1',
    name: 'exclusive_event_invitation',
    displayName: 'Exclusive Event Invitation',
    category: 'MARKETING',
    useCase: 'EVENT_PROMOTION',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, youre invited to our exclusive {{2}} event on {{3}}. Reserve your seat before registrations close.',
        example: { body_text: [['John', 'Business Growth Summit', 'August 10']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Reserve Seat', url: 'https://example.com/event' }
        ]
      }
    ]
  },
  {
    id: 'meta-review-1',
    name: 'review_request',
    displayName: 'Review Request',
    category: 'UTILITY',
    useCase: 'CUSTOMER_FEEDBACK',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, we hope youre enjoying {{2}}. We truly appreciate your honest feedback.',
        example: { body_text: [['John', 'our service']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Leave Review', url: 'https://example.com/review' }
        ]
      }
    ]
  },
  {
    id: 'meta-payment-1',
    name: 'payment_received',
    displayName: 'Payment Received',
    category: 'UTILITY',
    useCase: 'PAYMENT_UPDATES',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, we have successfully received your payment of {{2}}. Thank you for your business.',
        example: { body_text: [['John', '$120']] }
      }
    ]
  },
  {
    id: 'meta-payment-2',
    name: 'payment_failed',
    displayName: 'Payment Failed',
    category: 'UTILITY',
    useCase: 'PAYMENT_UPDATES',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, we could not process your recent payment of {{2}}. Please update your payment method to continue uninterrupted.',
        example: { body_text: [['John', '$50']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Update Payment', url: 'https://example.com/payment' }
        ]
      }
    ]
  },
  {
    id: 'meta-renewal-1',
    name: 'subscription_renewal_due',
    displayName: 'Subscription Renewal',
    category: 'UTILITY',
    useCase: 'SUBSCRIPTION_MANAGEMENT',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hello {{1}}, your subscription for {{2}} renews on {{3}}. Renew now to continue enjoying uninterrupted access.',
        example: { body_text: [['John', 'Premium Plan', 'August 1']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Renew Now', url: 'https://example.com/renew' }
        ]
      }
    ]
  },
  {
    id: 'meta-trial-1',
    name: 'trial_expiring',
    displayName: 'Trial Expiring',
    category: 'MARKETING',
    useCase: 'TRIAL_CONVERSION',
    industry: 'SaaS',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your free trial expires in {{2}}. Upgrade today to keep your progress and premium features.',
        example: { body_text: [['John', '2 days']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Upgrade Now', url: 'https://example.com/upgrade' }
        ]
      }
    ]
  },
  {
    id: 'meta-quote-1',
    name: 'quotation_ready',
    displayName: 'Quotation Ready',
    category: 'UTILITY',
    useCase: 'SALES_PROCESS',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your requested quotation for {{2}} is now ready. Review it anytime using the link below.',
        example: { body_text: [['John', 'Office Renovation']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'View Quote', url: 'https://example.com/quote' }
        ]
      }
    ]
  },
  {
    id: 'meta-booking-1',
    name: 'booking_waitlist_available',
    displayName: 'Booking Available',
    category: 'UTILITY',
    useCase: 'BOOKING_UPDATES',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Good news {{1}}! A slot has become available for {{2}}. Confirm your booking before someone else claims it.',
        example: { body_text: [['John', 'your appointment']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Confirm Booking', url: 'https://example.com/booking' }
        ]
      }
    ]
  },
  {
    id: 'meta-referral-1',
    name: 'refer_friend_rewards',
    displayName: 'Referral Rewards',
    category: 'MARKETING',
    useCase: 'REFERRAL_PROGRAM',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, invite your friends and you will both receive {{2}} after their first successful purchase.',
        example: { body_text: [['John', '$15 Credit']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Invite Friends', url: 'https://example.com/refer' }
        ]
      }
    ]
  },
  {
    id: 'meta-progress-1',
    name: 'application_status_update',
    displayName: 'Application Status Update',
    category: 'UTILITY',
    useCase: 'APPLICATION_UPDATES',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your application for {{2}} is now {{3}}. We will notify you once the next step is available.',
        example: { body_text: [['John', 'Business Loan', 'Under Review']] }
      }
    ]
  },
  {
    id: 'meta-security-1',
    name: 'new_device_login',
    displayName: 'New Device Login',
    category: 'UTILITY',
    useCase: 'SECURITY_ALERTS',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, we noticed a sign-in from a new device in {{2}}. If this was not you, please secure your account immediately.',
        example: { body_text: [['John', 'New York']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Secure Account', url: 'https://example.com/security' }
        ]
      }
    ]
  },
  {
    id: 'meta-upgrade-1',
    name: 'plan_upgrade_offer',
    displayName: 'Plan Upgrade Offer',
    category: 'MARKETING',
    useCase: 'UPSELL',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, unlock even more value by upgrading to {{2}} and enjoy {{3}}.',
        example: { body_text: [['John', 'Premium', 'exclusive features']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Upgrade Plan', url: 'https://example.com/upgrade' }
        ]
      }
    ]
  },
  {
    id: 'meta-birthday-1',
    name: 'birthday_special_offer',
    displayName: 'Birthday Special Offer',
    category: 'MARKETING',
    useCase: 'CUSTOMER_ENGAGEMENT',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Happy Birthday, {{1}}! 🎂 Celebrate with {{2}} on your next purchase. Your gift is valid until {{3}}.',
        example: { body_text: [['John', '25% OFF', 'August 5']] }
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Redeem Gift', url: 'https://example.com/birthday' }
        ]
      }
    ]
  },
  {
    id: 'meta-announcement-1',
    name: 'important_service_update',
    displayName: 'Important Service Update',
    category: 'UTILITY',
    useCase: 'SERVICE_NOTIFICATIONS',
    industry: 'General',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hello {{1}}, we are introducing improvements to {{2}} starting {{3}}. These updates are designed to provide you with a better experience.',
        example: { body_text: [['John', 'our platform', 'August 1']] }
      }
    ]
  },

  {
    "id": "meta-hinglish-1",
    "name": "lead_follow_up_reminder",
    "displayName": "Lead Follow Up Reminder",
    "category": "MARKETING",
    "useCase": "LEAD_NURTURING",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, bas ek quick reminder 😊. Aapne {{2}} ke baare mein enquiry ki thi. Agar aap ready hain to hum aapki help karne ke liye available hain.",
        "example": {
          "body_text": [
            ["Rahul", "AI Automation Service"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Yes, Interested"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Need More Info"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-hinglish-2",
    "name": "limited_time_offer",
    "displayName": "Limited Time Offer",
    "category": "MARKETING",
    "useCase": "LIMITED_TIME_OFFER",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}} 🎉 Sirf {{2}} tak aapke liye special offer available hai. Is opportunity ko miss mat kariye.",
        "example": {
          "body_text": [
            ["Rahul", "31 July"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Claim Offer",
            "url": "https://example.com/offer"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-hinglish-3",
    "name": "callback_request",
    "displayName": "Request a Callback",
    "category": "MARKETING",
    "useCase": "CALLBACK_REQUEST",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, agar aap busy hain to koi problem nahi 😊. Hum aapko aapke convenient time par call kar sakte hain.",
        "example": {
          "body_text": [
            ["Rahul"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Call Me"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Later"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-hinglish-4",
    "name": "booking_confirmation_hinglish",
    "displayName": "Booking Confirmation",
    "category": "UTILITY",
    "useCase": "BOOKING_CONFIRMATION",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, aapki booking {{2}} ke liye successfully confirm ho gayi hai. Hum aapse {{3}} ko milenge.",
        "example": {
          "body_text": [
            ["Rahul", "Demo Session", "30 July"]
          ]
        }
      }
    ]
  },
  {
    "id": "meta-hinglish-5",
    "name": "payment_reminder_hinglish",
    "displayName": "Payment Reminder",
    "category": "UTILITY",
    "useCase": "PAYMENT_REMINDER",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, friendly reminder 😊. Aapka payment {{2}} abhi pending hai. Kripya due date se pehle complete kar dein.",
        "example": {
          "body_text": [
            ["Rahul", "$250"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Pay Now",
            "url": "https://example.com/pay"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-hinglish-6",
    "name": "free_demo_invitation",
    "displayName": "Free Demo Invitation",
    "category": "MARKETING",
    "useCase": "FREE_DEMO",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, sirf 15 minutes ka FREE demo book kijiye aur dekhiye kaise {{2}} aapke business ko grow kar sakta hai.",
        "example": {
          "body_text": [
            ["Rahul", "AI Automation"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Book Demo",
            "url": "https://example.com/demo"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-hinglish-7",
    "name": "customer_feedback_hinglish",
    "displayName": "Customer Feedback",
    "category": "UTILITY",
    "useCase": "CUSTOMER_FEEDBACK",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, humein umeed hai ki aapka experience accha raha hoga. Aapka feedback humare liye bahut valuable hai 😊.",
        "example": {
          "body_text": [
            ["Rahul"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Excellent"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Good"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Needs Improvement"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-hinglish-8",
    "name": "cart_reminder_hinglish",
    "displayName": "Cart Reminder",
    "category": "MARKETING",
    "useCase": "CART_RECOVERY",
    "industry": "E-commerce",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, aapke selected products abhi bhi cart mein hain 🛒. Order complete karke unhe apna bana lijiye.",
        "example": {
          "body_text": [
            ["Rahul"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Complete Order",
            "url": "https://example.com/cart"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-hinglish-9",
    "name": "membership_expiring",
    "displayName": "Membership Expiring",
    "category": "UTILITY",
    "useCase": "MEMBERSHIP_EXPIRY",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, aapki membership {{2}} ko expire ho rahi hai. Benefits continue rakhne ke liye renew kar lijiye.",
        "example": {
          "body_text": [
            ["Rahul", "31 July"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Renew Now",
            "url": "https://example.com/renew"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-hinglish-10",
    "name": "exclusive_vip_offer",
    "displayName": "VIP Exclusive Offer",
    "category": "MARKETING",
    "useCase": "VIP_PROMOTION",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}} 🌟 Aap humare special customers mein se ek hain. Isliye aapke liye exclusive {{2}} offer reserve kiya gaya hai.",
        "example": {
          "body_text": [
            ["Rahul", "25% OFF"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Unlock Offer",
            "url": "https://example.com/vip"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-hinglish-11",
    "name": "new_launch_invitation",
    "displayName": "New Launch Invitation",
    "category": "MARKETING",
    "useCase": "PRODUCT_LAUNCH",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}} 🎉 Humne abhi-abhi {{2}} launch kiya hai. Sabse pehle explore kijiye aur special launch benefits ka fayda uthaiye.",
        "example": {
          "body_text": [
            ["Rahul", "AI Voice Agent"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Explore Now",
            "url": "https://example.com/launch"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-hinglish-12",
    "name": "price_drop_notification",
    "displayName": "Price Drop Notification",
    "category": "MARKETING",
    "useCase": "PRICE_DROP",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}} 😊 Good news! {{2}} ki price ab sirf {{3}} hai. Yeh offer limited time ke liye available hai.",
        "example": {
          "body_text": [
            ["Rahul", "Premium Plan", "$49"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Buy Now",
            "url": "https://example.com/pricing"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-hinglish-13",
    "name": "document_request",
    "displayName": "Document Request",
    "category": "UTILITY",
    "useCase": "DOCUMENT_COLLECTION",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, process complete karne ke liye humein {{2}} ki zarurat hai. Kripya jaldi upload kar dein.",
        "example": {
          "body_text": [
            ["Rahul", "ID Proof"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Upload Document",
            "url": "https://example.com/upload"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-hinglish-14",
    "name": "service_completed",
    "displayName": "Service Completed",
    "category": "UTILITY",
    "useCase": "SERVICE_UPDATE",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, aapki {{2}} service successfully complete ho gayi hai. Humein serve karne ka mauka dene ke liye dhanyavaad.",
        "example": {
          "body_text": [
            ["Rahul", "Website Development"]
          ]
        }
      }
    ]
  },
  {
    "id": "meta-hinglish-15",
    "name": "referral_invitation",
    "displayName": "Refer & Earn",
    "category": "MARKETING",
    "useCase": "REFERRAL_PROGRAM",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}} 🎁 Apne doston ko refer kijiye aur har successful referral par {{2}} reward paiye.",
        "example": {
          "body_text": [
            ["Rahul", "$20"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Refer Friends",
            "url": "https://example.com/refer"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-hinglish-16",
    "name": "follow_up_after_demo",
    "displayName": "Demo Follow Up",
    "category": "MARKETING",
    "useCase": "POST_DEMO_FOLLOWUP",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, demo attend karne ke liye thank you 😊. Agar aapke koi questions hain ya next step discuss karna chahte hain to hum available hain.",
        "example": {
          "body_text": [
            ["Rahul"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "I'm Interested"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Need More Info"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-hinglish-17",
    "name": "renewal_success",
    "displayName": "Renewal Successful",
    "category": "UTILITY",
    "useCase": "SUBSCRIPTION_RENEWED",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}} 🎉 Aapki {{2}} membership successfully renew ho gayi hai. Thank you for staying with us.",
        "example": {
          "body_text": [
            ["Rahul", "Premium"]
          ]
        }
      }
    ]
  },
  {
    "id": "meta-hinglish-18",
    "name": "festival_special_offer",
    "displayName": "Festival Special Offer",
    "category": "MARKETING",
    "useCase": "SEASONAL_PROMOTION",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}} ✨ {{2}} ke mauke par hum lekar aaye hain special {{3}} discount. Offer sirf limited period ke liye valid hai.",
        "example": {
          "body_text": [
            ["Rahul", "Diwali", "30%"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Claim Offer",
            "url": "https://example.com/festival"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-hinglish-19",
    "name": "profile_completion_reminder",
    "displayName": "Complete Your Profile",
    "category": "UTILITY",
    "useCase": "PROFILE_COMPLETION",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, aapka profile abhi complete nahi hua hai. Bas kuch simple steps complete karke saare features unlock kijiye.",
        "example": {
          "body_text": [
            ["Rahul"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Complete Profile",
            "url": "https://example.com/profile"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-hinglish-20",
    "name": "exclusive_last_chance_offer",
    "displayName": "Last Chance Offer",
    "category": "MARKETING",
    "useCase": "LAST_CHANCE_PROMOTION",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}} ⏳ Yeh aapke special offer ka last reminder hai. Offer {{2}} ko expire ho jayega. Agar lena chahte hain to aaj hi claim kar lijiye.",
        "example": {
          "body_text": [
            ["Rahul", "31 July"]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Claim Now",
            "url": "https://example.com/last-offer"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-1",
    "name": "exclusive_member_offer",
    "displayName": "Exclusive Member Offer",
    "category": "MARKETING",
    "useCase": "LOYALTY_PROGRAM",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://example.com/member_offer.jpg"
          ]
        }
      },
      {
        "type": "BODY",
        "text": "Hi {{1}} 👋 Aap humare valued members mein se ek hain. Isliye sirf aapke liye {{2}} OFF unlock hua hai. Offer {{3}} tak valid hai.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "25%",
              "31 July"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Unlock Offer",
            "url": "https://example.com/member"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-2",
    "name": "product_back_in_stock",
    "displayName": "Back In Stock",
    "category": "MARKETING",
    "useCase": "PRODUCT_UPDATES",
    "industry": "Retail",
    "language": "en",
    "components": [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://example.com/back_stock.jpg"
          ]
        }
      },
      {
        "type": "BODY",
        "text": "Hi {{1}} 🎉 Good news! {{2}} fir se stock mein aa gaya hai. Jaldi order kariye before it sells out again.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "Wireless Earbuds"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Buy Now",
            "url": "https://example.com/product"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-3",
    "name": "free_consultation_invite",
    "displayName": "Free Consultation",
    "category": "MARKETING",
    "useCase": "LEAD_NURTURING",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://example.com/consultation.jpg"
          ]
        }
      },
      {
        "type": "BODY",
        "text": "Hi {{1}} 😊 Let's discuss your goals. Book a FREE {{2}} consultation and discover how we can help.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "30-minute"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Book Now",
            "url": "https://example.com/book"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-4",
    "name": "service_reminder",
    "displayName": "Service Reminder",
    "category": "UTILITY",
    "useCase": "SERVICE_REMINDER",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, friendly reminder 😊 Aapki {{2}} service {{3}} ko scheduled hai. Agar reschedule karna ho to humein bataiye.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "Car Service",
              "30 July"
            ]
          ]
        }
      }
    ]
  },
  {
    "id": "meta-premium-5",
    "name": "invoice_due_reminder",
    "displayName": "Invoice Due Reminder",
    "category": "UTILITY",
    "useCase": "PAYMENT_UPDATES",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, Invoice {{2}} ka payment {{3}} tak due hai. Please due date se pehle complete kar dein.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "#INV1023",
              "31 July"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Pay Invoice",
            "url": "https://example.com/pay"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-6",
    "name": "account_verified",
    "displayName": "Account Verified",
    "category": "UTILITY",
    "useCase": "ACCOUNT_UPDATES",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Congratulations {{1}} 🎉 Aapka account successfully verify ho gaya hai. Ab aap saare features access kar sakte hain.",
        "example": {
          "body_text": [
            [
              "Rahul"
            ]
          ]
        }
      }
    ]
  },
  {
    "id": "meta-premium-7",
    "name": "security_login_alert",
    "displayName": "Security Login Alert",
    "category": "UTILITY",
    "useCase": "SECURITY_ALERTS",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, humne {{2}} se ek naya login detect kiya hai. Agar ye aap nahi the to immediately apna account secure karein.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "Mumbai"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Secure Account",
            "url": "https://example.com/security"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-8",
    "name": "authentication_otp_secure",
    "displayName": "Secure OTP",
    "category": "AUTHENTICATION",
    "useCase": "OTP",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "{{1}} is your verification code. Kisi ke saath bhi is code ko share na karein. Code {{2}} minutes mein expire ho jayega.",
        "example": {
          "body_text": [
            [
              "483920",
              "5"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "COPY_CODE",
            "text": "Copy Code"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-9",
    "name": "password_reset_success",
    "displayName": "Password Changed",
    "category": "UTILITY",
    "useCase": "SECURITY_ALERTS",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, aapka password successfully update ho gaya hai. Agar ye change aapne nahi kiya hai to turant support se contact karein.",
        "example": {
          "body_text": [
            [
              "Rahul"
            ]
          ]
        }
      }
    ]
  },
  {
    "id": "meta-premium-10",
    "name": "last_day_flash_sale",
    "displayName": "Last Day Flash Sale",
    "category": "MARKETING",
    "useCase": "FLASH_SALE",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://example.com/flash_sale.jpg"
          ]
        }
      },
      {
        "type": "BODY",
        "text": "⏰ Hi {{1}}, aaj LAST DAY hai! Flat {{2}} OFF sirf aaj ke liye. Don't miss out, offer midnight tak hi valid hai.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "40%"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Shop Now",
            "url": "https://example.com/flash-sale"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-11",
    "name": "trial_expiry_reminder",
    "displayName": "Trial Expiring Soon",
    "category": "MARKETING",
    "useCase": "TRIAL_CONVERSION",
    "industry": "SaaS",
    "language": "en",
    "components": [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://example.com/trial-ending.jpg"
          ]
        }
      },
      {
        "type": "BODY",
        "text": "Hi {{1}} 👋 Your FREE trial ends in {{2}}. Upgrade today aur bina interruption ke saare premium features enjoy kariye.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "2 days"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Upgrade Now",
            "url": "https://example.com/upgrade"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-12",
    "name": "browse_reminder",
    "displayName": "Browse Reminder",
    "category": "MARKETING",
    "useCase": "MARKETING_CAMPAIGNS",
    "industry": "Retail",
    "language": "en",
    "components": [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://example.com/browse-reminder.jpg"
          ]
        }
      },
      {
        "type": "BODY",
        "text": "Hi {{1}} 😊 Aapne recently {{2}} dekha tha. It's still available! Ek baar phir se check kariye before it's gone.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "Running Shoes"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "View Product",
            "url": "https://example.com/product"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-13",
    "name": "documents_verified_successfully",
    "displayName": "Documents Verified",
    "category": "UTILITY",
    "useCase": "ACCOUNT_UPDATES",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}} ✅ Aapke documents successfully verify ho gaye hain. Ab aap next step continue kar sakte hain.",
        "example": {
          "body_text": [
            [
              "Rahul"
            ]
          ]
        }
      }
    ]
  },
  {
    "id": "meta-premium-14",
    "name": "kyc_pending_action",
    "displayName": "Complete KYC",
    "category": "UTILITY",
    "useCase": "ACCOUNT_UPDATES",
    "industry": "Finance",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, aapka KYC abhi pending hai. Verification complete karne ke liye bas ek chhota sa step baaki hai.",
        "example": {
          "body_text": [
            [
              "Rahul"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Complete KYC",
            "url": "https://example.com/kyc"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-15",
    "name": "welcome_journey_started",
    "displayName": "Welcome Journey",
    "category": "MARKETING",
    "useCase": "MARKETING_CAMPAIGNS",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://example.com/welcome.jpg"
          ]
        }
      },
      {
        "type": "BODY",
        "text": "Welcome {{1}} 🎉 Aapki journey officially start ho chuki hai. Hum har step par aapki help karenge. Chaliye shuru karte hain!",
        "example": {
          "body_text": [
            [
              "Rahul"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Get Started",
            "url": "https://example.com/start"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-16",
    "name": "subscription_activated",
    "displayName": "Subscription Activated",
    "category": "UTILITY",
    "useCase": "ACCOUNT_UPDATES",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}} 🎉 Great news! Aapka {{2}} plan successfully activate ho gaya hai. Enjoy all your premium benefits from today.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "Premium Plan"
            ]
          ]
        }
      }
    ]
  },
  {
    "id": "meta-premium-17",
    "name": "order_delayed_notification",
    "displayName": "Order Delayed",
    "category": "UTILITY",
    "useCase": "ORDER_MANAGEMENT",
    "industry": "E-commerce",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}}, aapka order #{{2}} unexpected delay ki वजह se thoda late deliver hoga. Hum ise jaldi se jaldi deliver karne ki poori koshish kar rahe hain.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "ORD10245"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Track Order",
            "url": "https://example.com/track"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-18",
    "name": "referral_reward_unlocked",
    "displayName": "Referral Reward Unlocked",
    "category": "MARKETING",
    "useCase": "MARKETING_CAMPAIGNS",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://example.com/referral-reward.jpg"
          ]
        }
      },
      {
        "type": "BODY",
        "text": "Congratulations {{1}} 🎉 Aapka referral successful raha! Aapne {{2}} reward unlock kar liya hai. Claim karke enjoy kariye.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "₹500 Wallet Credit"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Claim Reward",
            "url": "https://example.com/reward"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-19",
    "name": "limited_seats_available",
    "displayName": "Limited Seats Available",
    "category": "MARKETING",
    "useCase": "MARKETING_CAMPAIGNS",
    "industry": "Education",
    "language": "en",
    "components": [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://example.com/limited-seats.jpg"
          ]
        }
      },
      {
        "type": "BODY",
        "text": "Hi {{1}} 🚀 Sirf kuch hi seats baaki hain for {{2}}. Reserve your seat today before registrations close.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "AI Masterclass"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Reserve Seat",
            "url": "https://example.com/register"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-20",
    "name": "review_request_with_image",
    "displayName": "Review Request",
    "category": "UTILITY",
    "useCase": "CUSTOMER_CARE",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://example.com/review-banner.jpg"
          ]
        }
      },
      {
        "type": "BODY",
        "text": "Hi {{1}} 😊 Thank you for choosing {{2}}. Agar aapka experience accha raha ho, we'd love to hear your feedback. Aapki review dusre customers ko better decision lene mein help karti hai.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "GetAiPilot"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Leave Review",
            "url": "https://example.com/review"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-21",
    "name": "price_increase_notice",
    "displayName": "Price Increase Notice",
    "category": "MARKETING",
    "useCase": "MARKETING_CAMPAIGNS",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://example.com/price-increase.jpg"
          ]
        }
      },
      {
        "type": "BODY",
        "text": "Hi {{1}} 👋 Just a heads-up! {{2}} se humare prices update hone wale hain. Aaj purchase karke current pricing ka benefit le sakte hain.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "1 August"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Buy Before Price Change",
            "url": "https://example.com/pricing"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-22",
    "name": "delivery_out_for_delivery",
    "displayName": "Out For Delivery",
    "category": "UTILITY",
    "useCase": "ORDER_MANAGEMENT",
    "industry": "E-commerce",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}} 🚚 Great news! Aapka order #{{2}} aaj delivery ke liye nikal chuka hai. Kripya delivery receive karne ke liye available rahein.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "ORD45872"
            ]
          ]
        }
      }
    ]
  },
  {
    "id": "meta-premium-23",
    "name": "free_shipping_campaign",
    "displayName": "Free Shipping Offer",
    "category": "MARKETING",
    "useCase": "MARKETING_CAMPAIGNS",
    "industry": "E-commerce",
    "language": "en",
    "components": [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://example.com/free-shipping.jpg"
          ]
        }
      },
      {
        "type": "BODY",
        "text": "Hi {{1}} 🎁 Limited time ke liye FREE Shipping on all eligible orders. Shop today aur delivery charges ki tension bhool jaiye.",
        "example": {
          "body_text": [
            [
              "Rahul"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Start Shopping",
            "url": "https://example.com/shop"
          }
        ]
      }
    ]
  },
  {
    "id": "meta-premium-24",
    "name": "warranty_activated",
    "displayName": "Warranty Activated",
    "category": "UTILITY",
    "useCase": "ACCOUNT_UPDATES",
    "industry": "Electronics",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hi {{1}} ✅ Aapke {{2}} ki warranty successfully activate ho gayi hai aur {{3}} tak valid rahegi.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "Laptop",
              "30 July 2027"
            ]
          ]
        }
      }
    ]
  },
  {
    "id": "meta-premium-25",
    "name": "exclusive_early_access",
    "displayName": "Early Access Invitation",
    "category": "MARKETING",
    "useCase": "MARKETING_CAMPAIGNS",
    "industry": "General",
    "language": "en",
    "components": [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://example.com/early-access.jpg"
          ]
        }
      },
      {
        "type": "BODY",
        "text": "Hi {{1}} 🚀 Congratulations! Aapko {{2}} ka Early Access mila hai. Public launch se pehle exclusive features explore kariye.",
        "example": {
          "body_text": [
            [
              "Rahul",
              "AI Workspace"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Get Early Access",
            "url": "https://example.com/early-access"
          }
        ]
      }
    ]
  }
  ];
