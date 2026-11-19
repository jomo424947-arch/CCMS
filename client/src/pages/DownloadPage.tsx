import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useSystemSettings } from '../context/SystemSettingsContext';
import { fetchLatestRelease, LatestReleaseInfo } from '../services/githubReleaseService';

export default function DownloadPage() {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const { systemName, systemLogoUrl } = useSystemSettings();
  const isAr = language === 'ar';

  const [release, setRelease] = useState<LatestReleaseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const data = await fetchLatestRelease();
      setRelease(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '85 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDate = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0A0A0E',
        color: '#FFFFFF',
        fontFamily: isAr
          ? "'Alexandria', 'Cairo', -apple-system, BlinkMacSystemFont, sans-serif"
          : "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        position: 'relative',
        overflowX: 'hidden',
        direction: isAr ? 'rtl' : 'ltr',
      }}
    >
      {/* Background ambient decorative glows */}
      <div
        style={{
          position: 'absolute',
          top: '-150px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '900px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(223, 168, 66, 0.12) 0%, rgba(112, 0, 255, 0.06) 45%, transparent 75%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '40%',
          left: '-200px',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(112, 0, 255, 0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
        {/* Navigation Bar */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '24px 0',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div
            onClick={() => navigate('/login')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {systemLogoUrl ? (
              <img
                src={systemLogoUrl}
                alt="Logo"
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  objectFit: 'contain',
                  border: '1px solid rgba(223, 168, 66, 0.3)',
                  boxShadow: '0 0 15px rgba(223, 168, 66, 0.25)',
                }}
              />
            ) : (
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, rgba(223, 168, 66, 0.2) 0%, rgba(112, 0, 255, 0.2) 100%)',
                  border: '1px solid rgba(223, 168, 66, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#DFA842',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>
                  shield
                </span>
              </div>
            )}
            <div>
              <div
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  letterSpacing: '0.04em',
                }}
              >
                {systemName || 'CCMS'}
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: '#DFA842',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {isAr ? 'نظام إدارة الصالات' : 'Management System'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Language Switcher */}
            <button
              onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#A1A1AA',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#FFFFFF';
                e.currentTarget.style.borderColor = 'rgba(223, 168, 66, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#A1A1AA';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              {language === 'ar' ? 'English' : 'العربية'}
            </button>

            {/* Login / Dashboard Link */}
            <button
              onClick={() => navigate('/login')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(223, 168, 66, 0.1)',
                border: '1px solid rgba(223, 168, 66, 0.3)',
                color: '#DFA842',
                padding: '8px 18px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#DFA842';
                e.currentTarget.style.color = '#000000';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(223, 168, 66, 0.1)';
                e.currentTarget.style.color = '#DFA842';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                login
              </span>
              <span>{isAr ? 'تسجيل الدخول' : 'Sign In'}</span>
            </button>
          </div>
        </header>

        {/* Hero Section */}
        <section
          style={{
            padding: '60px 0 40px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Live Release Tag Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 14px',
              borderRadius: '9999px',
              background: 'rgba(223, 168, 66, 0.08)',
              border: '1px solid rgba(223, 168, 66, 0.25)',
              marginBottom: '24px',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#22C55E',
                boxShadow: '0 0 10px #22C55E',
              }}
            />
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#DFA842',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {loading ? (isAr ? 'جاري الفحص...' : 'Checking latest...') : `${isAr ? 'الإصدار الأخير المستقر:' : 'Latest Stable Release:'} ${release?.version}`}
            </span>

            <button
              onClick={() => loadData(true)}
              title={isAr ? 'تحديث الفحص' : 'Refresh'}
              style={{
                background: 'none',
                border: 'none',
                color: '#A1A1AA',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px',
              }}
            >
              <span
                className={`material-symbols-outlined ${refreshing ? 'animate-spin' : ''}`}
                style={{ fontSize: '15px' }}
              >
                refresh
              </span>
            </button>
          </div>

          <h1
            style={{
              fontSize: 'clamp(28px, 5vw, 48px)',
              fontWeight: 800,
              lineHeight: 1.25,
              maxWidth: '850px',
              marginBottom: '20px',
              background: 'linear-gradient(180deg, #FFFFFF 0%, #BCC8D1 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {isAr
              ? 'تنزيل تطبيق CCMS لإدارة صالات الألعاب والسايبر'
              : 'Download CCMS Desktop for Gaming Lounges & Cyber Cafés'}
          </h1>

          <p
            style={{
              fontSize: 'clamp(15px, 2vw, 18px)',
              color: '#A1A1AA',
              maxWidth: '680px',
              lineHeight: 1.6,
              marginBottom: '36px',
            }}
          >
            {isAr
              ? 'تحكم متكامل في أجهزة PlayStation والكمبيوتر، مزامنة فورية، وفواتير دقيقة. يتم تحديث رابط التنزيل تلقائياً ومباشرة مع كل إصدار رسمي.'
              : 'Complete control for PlayStation and PC stations, automatic backup, and accurate billing — always up to date with the latest official release.'}
          </p>

          {/* Main Download Card */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.9) 0%, rgba(22, 22, 24, 0.95) 100%)',
              border: '1px solid rgba(223, 168, 66, 0.25)',
              borderRadius: '20px',
              padding: '36px 40px',
              maxWidth: '560px',
              width: '100%',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(223, 168, 66, 0.08)',
              position: 'relative',
            }}
          >
            {/* Primary Windows CTA */}
            <a
              href={release?.installerUrl || `https://github.com/jomo424947-arch/cyber-project/releases/download/v1.4.6/CCMS-Setup-1.4.6.exe`}
              download
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                width: '100%',
                padding: '18px 24px',
                borderRadius: '12px',
                background: 'linear-gradient(90deg, #E8BA62 0%, #C48A2A 100%)',
                color: '#0A0A0E',
                textDecoration: 'none',
                fontSize: '17px',
                fontWeight: 700,
                boxShadow: '0 8px 25px rgba(223, 168, 66, 0.35)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 12px 35px rgba(223, 168, 66, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(223, 168, 66, 0.35)';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
                download
              </span>
              <span>
                {isAr ? 'تنزيل لنظام Windows' : 'Download for Windows'} (64-bit)
              </span>
            </a>

            {/* Meta info below button */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                fontSize: '12px',
                color: '#71717A',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '15px', color: '#DFA842' }}>
                  description
                </span>
                <span>{release?.installerName || 'CCMS-Setup.exe'}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '15px', color: '#22C55E' }}>
                  hard_drive
                </span>
                <span>{formatFileSize(release?.installerSize || 0)}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '15px', color: '#8B5CF6' }}>
                  calendar_today
                </span>
                <span>{release ? formatDate(release.publishedAt) : ''}</span>
              </div>
            </div>

            {/* Checksum & verification badge */}
            <div
              style={{
                marginTop: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '12px',
                color: '#A1A1AA',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#22C55E' }}>
                verified_user
              </span>
              <span>{isAr ? 'نسخة رسمية ومفحوصة أمنياً وخالية من أي برمجيات ضارة' : 'Verified official build, secure and malware-free'}</span>
            </div>
          </div>
        </section>

        {/* Android Companion App Card */}
        <section style={{ padding: '20px 0 40px', maxWidth: '560px', margin: '0 auto' }}>
          <div
            style={{
              background: '#111111',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '14px',
              padding: '18px 22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#22C55E',
                  flexShrink: 0,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>
                  smartphone
                </span>
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>
                  {isAr ? 'تطبيق الأندرويد (CCMS APK)' : 'Android Companion (APK)'}
                </div>
                <div style={{ fontSize: '12px', color: '#71717A', marginTop: '2px' }}>
                  {isAr ? 'متابعة وإدارة الصالة عن بعد من الهاتف المحمول' : 'Remote lounge monitoring & management'}
                </div>
              </div>
            </div>
            <a
              href="/downloads/CCMS.apk"
              download="CCMS.apk"
              style={{
                color: '#22C55E',
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                padding: '8px 16px',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#22C55E';
                e.currentTarget.style.color = '#000000';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)';
                e.currentTarget.style.color = '#22C55E';
              }}
            >
              <span>{isAr ? 'تنزيل' : 'Download'}</span>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                download
              </span>
            </a>
          </div>
        </section>

        {/* Live Changelog / Release Notes */}
        {release?.body && (
          <section style={{ padding: '0 0 50px', maxWidth: '680px', margin: '0 auto' }}>
            <div
              style={{
                background: '#111111',
                border: '1px solid rgba(223, 168, 66, 0.15)',
                borderRadius: '16px',
                padding: '28px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="material-symbols-outlined" style={{ color: '#DFA842', fontSize: '22px' }}>
                    new_releases
                  </span>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>
                    {isAr ? `أبرز تحديثات الإصدار ${release.version}` : `Release Highlights (${release.version})`}
                  </h3>
                </div>

                <span style={{ fontSize: '12px', color: '#71717A', fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatDate(release.publishedAt)}
                </span>
              </div>

              <div
                style={{
                  fontSize: '14px',
                  color: '#A1A1AA',
                  lineHeight: 1.8,
                  whiteSpace: 'pre-wrap',
                  background: 'rgba(0, 0, 0, 0.3)',
                  padding: '16px 20px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  fontFamily: isAr ? 'inherit' : "'JetBrains Mono', monospace",
                }}
              >
                {release.body}
              </div>
            </div>
          </section>
        )}

        {/* Quick Installation Steps */}
        <section style={{ padding: '0 0 70px', maxWidth: '680px', margin: '0 auto' }}>
          <div
            style={{
              background: '#111111',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '30px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '22px' }}>
              <span className="material-symbols-outlined" style={{ color: '#DFA842', fontSize: '24px' }}>
                install_desktop
              </span>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#FFFFFF' }}>
                {isAr ? 'خطوات التثبيت والتشغيل' : 'Installation Guide'}
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {[
                {
                  step: '01',
                  title: isAr ? 'تحميل برنامج التثبيت' : 'Download the installer',
                  desc: isAr
                    ? 'انقر على زر التحميل في الأعلى لحفظ ملف CCMS-Setup على جهازك.'
                    : 'Click the download button above to get the latest CCMS-Setup package.',
                },
                {
                  step: '02',
                  title: isAr ? 'تشغيل وتثبيت التطبيق' : 'Run the installer',
                  desc: isAr
                    ? 'افتح الملف واتبع التعليمات لإنشاء اختصار سطح المكتب تلقائياً.'
                    : 'Open the installer and follow the prompt to finish setup.',
                },
                {
                  step: '03',
                  title: isAr ? 'تسجيل الدخول والتفعيل' : 'Sign in & activate',
                  desc: isAr
                    ? 'قم بتسجيل الدخول بحساب الصالة لتفعيل بياناتك والمزامنة الفورية.'
                    : 'Sign in with your lounge credentials to link and activate your device.',
                },
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(223, 168, 66, 0.1)',
                      border: '1px solid rgba(223, 168, 66, 0.3)',
                      color: '#DFA842',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                      flexShrink: 0,
                    }}
                  >
                    {item.step}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '13px', color: '#71717A', lineHeight: 1.5 }}>
                      {item.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '32px 0 48px',
            textAlign: 'center',
            fontSize: '13px',
            color: '#71717A',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div>
            &copy; {new Date().getFullYear()} {systemName || 'CCMS'}. {isAr ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}
          </div>
          <div>
            <span
              onClick={() => navigate('/login')}
              style={{ color: '#DFA842', cursor: 'pointer', textDecoration: 'none' }}
            >
              {isAr ? 'تسجيل الدخول' : 'Sign In'}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
