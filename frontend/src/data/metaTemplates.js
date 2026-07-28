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
    }
];
