import React, { useEffect, useState } from "react";
import { RefreshCw, Wrench, Settings, Check, CheckCheck, Users, Megaphone, Smartphone, Activity, User, MoreVertical, MessageSquare } from "lucide-react";

interface MaintenanceGuardProps {
  children: React.ReactNode;
  productKey: string;
}

interface MaintenanceStatus {
  maintenance: boolean;
  maintenanceType?: string;
  title?: string;
  message?: string;
  expectedBackAt?: string;
  productName?: string;
}

const SUPABASE_URL = "https://uklxlappjcuvdqjvecfh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrbHhsYXBwamN1dmRxanZlY2ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxNDcwODMsImV4cCI6MjA4MzcyMzA4M30.v-TvyQrYpttcmCnzT9MkUlBgGXXU3lspZCxCYm-Oil4";

// Custom CSS for massive unified WhatsApp illustrative animations
const customStyles = `
  @keyframes wa-msg-enter-right {
    0% { transform: translateX(60px) scale(0.9); opacity: 0; }
    20% { transform: translateX(0) scale(1); opacity: 1; }
    80% { transform: translateX(0) scale(1); opacity: 1; }
    100% { transform: translateY(-40px); opacity: 0; }
  }
  @keyframes wa-msg-enter-left {
    0% { transform: translateX(-60px) scale(0.9); opacity: 0; }
    20% { transform: translateX(0) scale(1); opacity: 1; }
    80% { transform: translateX(0) scale(1); opacity: 1; }
    100% { transform: translateY(-40px); opacity: 0; }
  }
  @keyframes wa-float-card-heavy {
    0%, 100% { transform: translateY(0) rotate(-1deg); }
    50% { transform: translateY(-20px) rotate(1deg); }
  }
  @keyframes wa-float-card-medium {
    0%, 100% { transform: translateY(0) rotate(1.5deg); }
    50% { transform: translateY(15px) rotate(-1deg); }
  }
  @keyframes wa-typing-dot {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-5px); opacity: 1; }
  }
  @keyframes wa-delivery-flow {
    0% { color: #9ca3af; transform: scale(1); } /* Gray single */
    30% { color: #9ca3af; transform: scale(1.2); } /* Gray double */
    60%, 100% { color: #3b82f6; transform: scale(1); } /* Blue double */
  }
  @keyframes wa-bg-doodle-pan {
    0% { transform: translate(0, 0); }
    100% { transform: translate(-50px, -50px); }
  }

  @media (prefers-reduced-motion: reduce) {
    .anim-wa-msg-right, .anim-wa-msg-left, .anim-wa-heavy, .anim-wa-medium, .anim-typing, .anim-delivery, .wa-doodle-bg {
      animation: none !important;
      transform: none !important;
    }
  }

  .anim-wa-msg-right { animation: wa-msg-enter-right 8s cubic-bezier(0.2, 0.8, 0.2, 1) infinite; }
  .anim-wa-msg-left { animation: wa-msg-enter-left 8s cubic-bezier(0.2, 0.8, 0.2, 1) infinite 4s; }
  
  .anim-wa-heavy { animation: wa-float-card-heavy 10s ease-in-out infinite; }
  .anim-wa-medium { animation: wa-float-card-medium 12s ease-in-out infinite 2s; }
  .anim-wa-light { animation: wa-float-card-heavy 14s ease-in-out infinite 4s; }
  
  .anim-typing-1 { animation: wa-typing-dot 1.2s infinite 0s; }
  .anim-typing-2 { animation: wa-typing-dot 1.2s infinite 0.2s; }
  .anim-typing-3 { animation: wa-typing-dot 1.2s infinite 0.4s; }
  
  .anim-delivery { animation: wa-delivery-flow 8s infinite; }
  .wa-doodle-bg { animation: wa-bg-doodle-pan 30s linear infinite alternate; }

  /* WhatsApp Bubble Tails (Oversized) */
  .wa-tail-in::after {
    content: ''; position: absolute; top: 0; left: -14px; width: 14px; height: 22px;
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 8 13' width='14' height='22' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23ffffff' d='M1.533 3.568L8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568z'/%3E%3C/svg%3E");
  }
  .wa-tail-out::after {
    content: ''; position: absolute; top: 0; right: -14px; width: 14px; height: 22px;
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 8 13' width='14' height='22' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23d9fdd3' d='M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z'/%3E%3C/svg%3E");
  }
`;

export function MaintenanceGuard({ children, productKey }: MaintenanceGuardProps) {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    const checkStatus = async () => {
      try {
        const headers = {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json"
        };

        const [globalRes, productRes] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/system_settings?select=*`, { headers }),
          fetch(`${SUPABASE_URL}/rest/v1/system_products?product_key=eq.${productKey}&select=*`, { headers })
        ]);

        if (!globalRes.ok || !productRes.ok) throw new Error("Failed to fetch maintenance status");

        const globalData = await globalRes.json();
        const productData = await productRes.json();
        
        const globalSettings = globalData[0] || {};
        const product = productData[0] || {};

        if (mounted) {
          const now = new Date();
          
          let isGlobalMaintenance = globalSettings.global_maintenance_enabled;
          if (isGlobalMaintenance && globalSettings.end_at && new Date(globalSettings.end_at) <= now) {
              isGlobalMaintenance = false;
          }
          const isGlobalScheduleActive = globalSettings.start_at && globalSettings.end_at && 
            new Date(globalSettings.start_at) <= now && new Date(globalSettings.end_at) > now;
          const effectiveGlobalMaintenance = isGlobalMaintenance || isGlobalScheduleActive;

          let isProductMaintenance = product.maintenance_enabled;
          if (isProductMaintenance && product.maintenance_end_at && new Date(product.maintenance_end_at) <= now) {
              isProductMaintenance = false;
          }
          const isProductScheduled = product.maintenance_start_at && product.maintenance_end_at &&
            new Date(product.maintenance_start_at) <= now && new Date(product.maintenance_end_at) > now;
            
          const isMaintenance = effectiveGlobalMaintenance || isProductMaintenance || isProductScheduled;
          
          let title = product.maintenance_title || "Upgrading Messaging Services";
          let message = product.maintenance_message || `Our WhatsApp automation engines are being upgraded for faster message delivery and better broadcast stability. We will be back online shortly!`;
          let expectedBackAt = product.maintenance_end_at;
          
          if (effectiveGlobalMaintenance) {
              title = globalSettings.title || "System Maintenance";
              message = globalSettings.message || "We are performing a major system upgrade across all services. We will be back online shortly!";
              expectedBackAt = globalSettings.end_at;
          }

          setStatus({
            maintenance: !!isMaintenance,
            title,
            message,
            expectedBackAt,
            productName: product.product_name || "GAP WhatsApp"
          });
        }
      } catch (error) {
        console.error("Maintenance check failed:", error);
        if (mounted) setStatus({ maintenance: false });
      } finally {
        if (mounted) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [productKey]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    window.location.reload();
  };

  if (loading && !status) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-[#e9edef] border-t-[#25D366] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (status?.maintenance) {
    let formattedTime = null;
    if (status.expectedBackAt) {
      const expectedDate = new Date(status.expectedBackAt);
      if (expectedDate > new Date()) {
        const isToday = expectedDate.toDateString() === new Date().toDateString();
        const timeString = expectedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        formattedTime = isToday ? `Today at ${timeString}` : `${expectedDate.toLocaleDateString()} at ${timeString}`;
      }
    }

    return (
      <div className="relative min-h-[100dvh] w-full bg-[#f0f2f5] overflow-hidden flex flex-col font-sans">
        <style dangerouslySetInnerHTML={{ __html: customStyles }} />
        
        {/* Background Doodle Layer (Unified fullscreen) */}
        <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.03] wa-doodle-bg"
             style={{
               backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 20 A 10 10 0 0 1 40 20 A 10 10 0 0 1 20 20 Z M70 60 L80 80 L60 80 Z M10 80 Q 20 60 30 80 T 50 80' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E")`,
               backgroundSize: '150px 150px'
             }} 
        />

        {/* Top Header */}
        <header className="absolute top-0 left-0 w-full px-8 py-8 md:px-12 md:py-10 flex justify-between items-center z-50">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="GAP WhatsApp Pilot" className="h-9 w-auto object-contain" />
            <span className="text-[#111b21] font-black tracking-widest uppercase text-xl">
              WhatsApp Pilot
            </span>
          </div>
          
          <div className="flex items-center gap-3 px-5 py-2.5 rounded-full bg-white shadow-md border border-[#e9edef] text-sm font-bold text-[#111b21]">
            <span className="w-3 h-3 rounded-full bg-[#25D366] animate-pulse shadow-[0_0_12px_rgba(37,211,102,0.8)]" />
            System Maintenance
          </div>
        </header>

        {/* Unified Full-Screen Layout */}
        <main className="flex-1 w-full flex items-center justify-center relative z-20 h-full min-h-screen">
          
          {/* LEFT/CENTER CONTENT - The Typography */}
          <div className="relative z-40 w-full max-w-7xl mx-auto flex flex-col justify-center px-8 md:px-16 lg:w-[45%] h-full pt-20 pb-20">
            <h1 className="text-[clamp(44px,5vw,72px)] font-black text-[#111b21] leading-[1.05] tracking-tight mb-8">
              {status.title}
            </h1>
            
            <p className="text-[18px] md:text-[22px] text-[#54656f] leading-relaxed max-w-xl mb-12 font-medium">
              {status.message}
            </p>

            <div className="bg-white border border-[#e9edef] p-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-xl shadow-[0_15px_40px_rgba(11,20,26,0.05)]">
              <span className="px-6 text-xl text-[#3b4a54] font-bold">
                {formattedTime ? `Expected Back: ${formattedTime}` : "Expected back shortly"}
              </span>
              <button 
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="bg-[#00a884] hover:bg-[#008f6f] text-white px-10 h-16 rounded-xl text-xl font-bold transition-all flex items-center justify-center gap-3 disabled:opacity-70 shadow-lg hover:shadow-[0_10px_25px_rgba(0,168,132,0.4)] hover:-translate-y-0.5 active:scale-95"
              >
                {isRefreshing ? (
                  <RefreshCw className="w-6 h-6 animate-spin" />
                ) : (
                  "Check Status"
                )}
              </button>
            </div>
          </div>

          {/* BACKGROUND/ORBITING ELEMENTS - The massive WhatsApp UI pieces */}
          <div className="absolute inset-0 z-30 pointer-events-none hidden lg:block overflow-hidden">
            
            {/* 1. Massive Broadcast Campaign Card (Top Right) */}
            <div className="absolute top-[12%] right-[10%] w-[420px] anim-wa-heavy">
              <div className="bg-white rounded-[28px] shadow-[0_20px_50px_rgba(11,20,26,0.1)] border border-[#e9edef] overflow-hidden">
                <div className="bg-gradient-to-r from-[#00a884] to-[#128C7E] px-6 py-5 flex items-center gap-4">
                  <Megaphone className="w-8 h-8 text-white" />
                  <span className="text-white font-bold text-xl tracking-wide">Black Friday Broadcast</span>
                  <div className="ml-auto bg-white/20 px-3 py-1 rounded-full text-white text-xs font-bold uppercase backdrop-blur-sm">Processing</div>
                </div>
                <div className="p-8">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-sm font-bold text-[#54656f] uppercase tracking-wider flex items-center gap-2">
                      <Users className="w-5 h-5 text-[#00a884]" /> Selected Audience
                    </span>
                    <div className="text-xl font-black text-[#111b21]">
                      12,450
                    </div>
                  </div>
                  <div className="w-full bg-[#f0f2f5] rounded-full h-3 mb-3 overflow-hidden">
                    <div className="bg-[#25D366] h-full rounded-full w-[78%] shadow-[0_0_10px_rgba(37,211,102,0.5)]" />
                  </div>
                  <div className="flex justify-between text-sm text-[#54656f] font-bold">
                    <span>Sending in progress...</span>
                    <span className="text-[#00a884]">78%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Chat Conversation Stacks (Middle Right) */}
            <div className="absolute top-[45%] right-[5%] flex flex-col gap-8 w-[380px]">
              
              {/* Outgoing Animated Bubble */}
              <div className="bg-[#d9fdd3] rounded-3xl rounded-tr-none p-5 shadow-lg wa-tail-out self-end w-[95%] anim-wa-msg-right relative border border-[#c3f0bb]">
                <div className="h-4 w-[90%] bg-[#128C7E]/30 rounded-full mb-3" />
                <div className="h-4 w-[75%] bg-[#128C7E]/20 rounded-full mb-4" />
                <div className="flex justify-end items-center gap-2">
                  <span className="text-xs text-[#54656f] font-bold">14:05</span>
                  <CheckCheck className="w-6 h-6 anim-delivery" />
                </div>
              </div>

              {/* Incoming Typing Bubble */}
              <div className="bg-white rounded-3xl rounded-tl-none p-5 shadow-lg wa-tail-in self-start w-[160px] anim-wa-msg-left border border-[#e9edef] mt-4">
                <div className="flex items-center gap-2.5 h-6 px-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#8696a0] anim-typing-1" />
                  <div className="w-3.5 h-3.5 rounded-full bg-[#8696a0] anim-typing-2" />
                  <div className="w-3.5 h-3.5 rounded-full bg-[#8696a0] anim-typing-3" />
                </div>
              </div>
            </div>

            {/* 3. Contact Row Card (Bottom Center/Right) */}
            <div className="absolute bottom-[10%] left-[55%] w-[450px] anim-wa-medium">
              <div className="bg-white rounded-[24px] shadow-[0_20px_50px_rgba(11,20,26,0.1)] border border-[#e9edef] p-6 flex flex-col gap-4">
                <div className="flex justify-between items-center mb-2">
                   <h3 className="text-[#111b21] font-black text-lg">Active Contacts</h3>
                   <MoreVertical className="w-6 h-6 text-[#8696a0]" />
                </div>
                
                {/* Contact Row 1 */}
                <div className="flex items-center gap-5 p-3 hover:bg-[#f5f6f6] rounded-xl transition-colors">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-[#e1e9ed] flex items-center justify-center overflow-hidden">
                      <User className="w-8 h-8 text-[#8696a0]" />
                    </div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 bg-[#25D366] border-2 border-white rounded-full" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-[#111b21] text-lg">Sarah Jenkins</span>
                      <span className="text-sm text-[#00a884] font-bold">14:02</span>
                    </div>
                    <div className="text-[#54656f] text-sm flex items-center gap-2">
                      <CheckCheck className="w-4 h-4 text-[#3b82f6]" /> Great, I'll take a look!
                    </div>
                  </div>
                </div>

                {/* Contact Row 2 */}
                <div className="flex items-center gap-5 p-3 hover:bg-[#f5f6f6] rounded-xl transition-colors opacity-70">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center">
                    <span className="text-indigo-600 font-bold text-xl">TC</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-[#111b21] text-lg">TechCorp Sales</span>
                      <span className="text-sm text-[#8696a0] font-bold">13:45</span>
                    </div>
                    <div className="text-[#54656f] text-sm flex items-center gap-2">
                      <Check className="w-4 h-4 text-[#8696a0]" /> Proposal document attached.
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* 4. Small Automation Status Widget (Top Center) */}
            <div className="absolute top-[20%] left-[45%] bg-white px-6 py-4 rounded-full shadow-[0_15px_30px_rgba(11,20,26,0.08)] border border-[#e9edef] flex items-center gap-4 anim-wa-light">
              <div className="w-10 h-10 rounded-full bg-[#25D366]/10 flex items-center justify-center">
                <Settings className="w-6 h-6 text-[#00a884] animate-spin-slow" style={{ animationDuration: '6s' }} />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-black text-[#111b21] uppercase tracking-wider">Engine Upgrading</span>
                <span className="text-xs text-[#54656f] font-medium">Auto-replies paused</span>
              </div>
            </div>

          </div>
        </main>
      </div>
    );
  }

  return <>{children}</>;
}
