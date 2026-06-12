import { Link } from 'react-router-dom'
import { Headphones, Zap, Tags, Smartphone, ArrowRight, Download } from 'lucide-react'

export function LandingPage() {
  return (
    <div className="min-h-[calc(100vh-73px)] flex flex-col">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-20 text-center relative overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent/20 dark:bg-accent/10 blur-[120px] rounded-full -z-10 pointer-events-none" />
        
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent font-medium text-sm mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
            SpotDL v2 is Live
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-light-text dark:text-dark-text mb-6">
            Premium Spotify <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-green-400">
              Audio Downloader
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-light-muted dark:text-dark-muted max-w-2xl mx-auto mb-10 leading-relaxed">
            Download your favorite tracks, albums, and playlists in high-quality 320kbps MP3 format. Complete with album art and ID3 tags. No premium required.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/download"
              className="group relative inline-flex items-center gap-2 px-8 py-4 bg-accent text-white font-semibold rounded-2xl overflow-hidden shadow-lg shadow-accent/25 hover:shadow-accent/40 transition-all active:scale-95"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <span className="relative">Start Downloading</span>
              <ArrowRight className="w-5 h-5 relative group-hover:translate-x-1 transition-transform" />
            </Link>
            
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-8 py-4 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border text-light-text dark:text-dark-text font-semibold rounded-2xl hover:bg-gray-50 dark:hover:bg-dark-border transition-colors active:scale-95"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-4 py-24 bg-light-surface/50 dark:bg-dark-surface/50 border-y border-light-border dark:border-dark-border relative">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">
            <h2 className="text-3xl font-bold text-light-text dark:text-dark-text mb-4">Why choose SpotDL?</h2>
            <p className="text-light-muted dark:text-dark-muted max-w-2xl mx-auto">We've built the most reliable and feature-rich downloading experience.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard 
              icon={<Headphones className="w-6 h-6 text-accent" />}
              title="High Quality Audio"
              description="Downloads are processed at up to 320kbps MP3 for crystal clear sound."
              delay="300ms"
            />
            <FeatureCard 
              icon={<Tags className="w-6 h-6 text-blue-500" />}
              title="Metadata Tagging"
              description="Automatically tags your files with correct titles, artists, albums, and cover art."
              delay="400ms"
            />
            <FeatureCard 
              icon={<Zap className="w-6 h-6 text-yellow-500" />}
              title="Lightning Fast"
              description="Optimized backend pipeline ensures your downloads finish in seconds."
              delay="500ms"
            />
            <FeatureCard 
              icon={<Smartphone className="w-6 h-6 text-purple-500" />}
              title="Cross Platform"
              description="Use SpotDL on the web or install the native Android APK for on-the-go access."
              delay="600ms"
            />
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="px-4 py-24 scroll-mt-20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-light-text dark:text-dark-text mb-16">How it works</h2>
          
          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting line for desktop */}
            <div className="hidden md:block absolute top-12 left-1/6 right-1/6 h-[2px] bg-gradient-to-r from-transparent via-light-border dark:via-dark-border to-transparent -z-10" />
            
            <StepCard number="1" title="Copy Link" description="Find a track, album, or playlist on Spotify and copy its share link." />
            <StepCard number="2" title="Paste & Fetch" description="Paste the link into SpotDL. We'll instantly fetch the metadata and artwork." />
            <StepCard number="3" title="Download" description="Click download. We'll find the highest quality audio and tag it for you." />
          </div>
          
          <div className="mt-16">
             <Link
              to="/download"
              className="inline-flex items-center gap-2 px-8 py-4 bg-accent/10 text-accent font-semibold rounded-2xl hover:bg-accent hover:text-white transition-all active:scale-95"
            >
              <Download className="w-5 h-5" />
              Try it Now
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-sm text-light-muted dark:text-dark-muted border-t border-light-border dark:border-dark-border">
        <p>Built with ❤️ using React, Tailwind CSS, and FastAPI.</p>
        <p className="mt-2 text-xs">SpotDL is not affiliated with Spotify AB.</p>
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, description, delay }: { icon: React.ReactNode, title: string, description: string, delay: string }) {
  return (
    <div 
      className="p-6 rounded-2xl bg-white dark:bg-dark-bg border border-light-border dark:border-dark-border shadow-sm hover:shadow-md transition-shadow animate-in fade-in slide-in-from-bottom-8 fill-mode-both"
      style={{ animationDelay: delay }}
    >
      <div className="w-12 h-12 rounded-xl bg-light-bg dark:bg-dark-surface flex items-center justify-center mb-4 border border-light-border dark:border-dark-border">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-light-text dark:text-dark-text mb-2">{title}</h3>
      <p className="text-light-muted dark:text-dark-muted leading-relaxed">{description}</p>
    </div>
  )
}

function StepCard({ number, title, description }: { number: string, title: string, description: string }) {
  return (
    <div className="relative flex flex-col items-center">
      <div className="w-16 h-16 rounded-full bg-light-surface dark:bg-dark-surface border-4 border-white dark:border-dark-bg flex items-center justify-center text-xl font-bold text-accent shadow-lg mb-6 z-10">
        {number}
      </div>
      <h3 className="text-xl font-semibold text-light-text dark:text-dark-text mb-3">{title}</h3>
      <p className="text-light-muted dark:text-dark-muted leading-relaxed">{description}</p>
    </div>
  )
}
