import { Link } from 'react-router-dom'
import { Headphones, Zap, Tags, Smartphone, ArrowRight, Download, Music } from 'lucide-react'


export function LandingPage() {
  return (
    <div className="min-h-[calc(100vh-73px)] flex flex-col relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-[20%] -left-[10%] w-[800px] h-[800px] bg-accent/20 dark:bg-accent/10 blur-[120px] rounded-full" />
        <div className="absolute top-[40%] -right-[20%] w-[600px] h-[600px] bg-blue-500/20 dark:bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-24 text-center relative">
        
        <div className="max-w-4xl mx-auto z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-light-surface/80 dark:bg-dark-surface/80 backdrop-blur-md border border-accent/20 text-accent font-medium text-sm mb-8 shadow-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent"></span>
            </span>
            SpotDL v2 is Live
          </div>
          
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight text-light-text dark:text-dark-text mb-6">
            Premium Spotify <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-green-400 to-emerald-300">
              Audio Downloader
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-light-muted dark:text-dark-muted max-w-2xl mx-auto mb-12 leading-relaxed">
            Download your favorite tracks, albums, and playlists in high-quality 320kbps MP3 format. Complete with album art and ID3 tags. No premium required.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
            <Link to="/download" className="w-full sm:w-auto">
              <button className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-accent text-white font-semibold rounded-2xl overflow-hidden shadow-[0_0_40px_-10px_rgba(16,185,129,0.5)] hover:shadow-[0_0_60px_-15px_rgba(16,185,129,0.7)] transition-shadow hover:scale-[1.02] active:scale-[0.98] transition-transform">
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                <span className="relative z-10 flex items-center gap-2">
                  <Music className="w-5 h-5" />
                  Start Downloading
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </button>
            </Link>
            
            <a href="#how-it-works" className="w-full sm:w-auto">
              <button className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-light-surface/50 dark:bg-dark-surface/50 backdrop-blur-sm border border-light-border dark:border-dark-border text-light-text dark:text-dark-text font-semibold rounded-2xl hover:bg-light-surface dark:hover:bg-dark-surface transition-colors hover:scale-[1.02] active:scale-[0.98] transition-transform">
                Learn More
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-4 py-32 bg-gradient-to-b from-transparent to-light-surface/50 dark:to-dark-surface/30 relative border-t border-light-border/50 dark:border-dark-border/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold text-light-text dark:text-dark-text mb-6">Why choose SpotDL?</h2>
            <p className="text-lg text-light-muted dark:text-dark-muted max-w-2xl mx-auto">We've built the most reliable, feature-rich downloading pipeline to give you the ultimate audio experience.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard 
              icon={<Headphones className="w-7 h-7 text-accent" />}
              title="High Quality Audio"
              description="Downloads are processed at up to 320kbps MP3 for crystal clear, lossless-feeling sound."
            />
            <FeatureCard 
              icon={<Tags className="w-7 h-7 text-blue-500" />}
              title="Metadata Tagging"
              description="Automatically embeds correct titles, artists, albums, and high-res cover art."
            />
            <FeatureCard 
              icon={<Zap className="w-7 h-7 text-yellow-500" />}
              title="Lightning Fast"
              description="Optimized yt-dlp backend pipeline ensures your downloads finish in mere seconds."
            />
            <FeatureCard 
              icon={<Smartphone className="w-7 h-7 text-purple-500" />}
              title="Cross Platform"
              description="Use SpotDL beautifully on the web or install the native Android APK for on-the-go access."
            />
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="px-4 py-32 scroll-mt-20">
        <div className="max-w-5xl mx-auto text-center">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold text-light-text dark:text-dark-text mb-20">How it works</h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-12 md:gap-8 relative">
            {/* Connecting line for desktop */}
            <div className="hidden md:block absolute top-[44px] left-[16%] right-[16%] h-[2px] -z-10 overflow-hidden">
              <div className="w-full h-full bg-gradient-to-r from-transparent via-accent to-transparent" />
              <div className="absolute inset-0 bg-light-border dark:bg-dark-border opacity-50" />
            </div>
            
            <StepCard 
              number="1" 
              title="Copy Link" 
              description="Find a track, album, or playlist on Spotify and copy its share link." 
            />
            <StepCard 
              number="2" 
              title="Paste & Fetch" 
              description="Paste the link into SpotDL. We'll instantly fetch the metadata and artwork." 
            />
            <StepCard 
              number="3" 
              title="Download" 
              description="Click download. We'll find the highest quality audio and tag it for you." 
            />
          </div>
          
          <div className="mt-24">
             <Link to="/download">
              <button className="inline-flex items-center gap-2 px-8 py-4 bg-light-surface dark:bg-dark-surface border border-accent/30 text-accent font-semibold rounded-2xl hover:bg-accent hover:text-white hover:shadow-[0_0_30px_-5px_rgba(16,185,129,0.4)] transition-all hover:scale-[1.05] active:scale-[0.95] transition-transform">
                <Download className="w-5 h-5" />
                Try it Now
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 text-center text-sm text-light-muted dark:text-dark-muted border-t border-light-border/30 dark:border-dark-border/30 backdrop-blur-md">
        <p>Built with ❤️ using React, Tailwind CSS, Framer Motion, and FastAPI.</p>
        <p className="mt-2 text-xs opacity-70">SpotDL is not affiliated with Spotify AB.</p>
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-8 rounded-3xl bg-white/50 dark:bg-dark-surface/50 backdrop-blur-md border border-light-border/50 dark:border-dark-border/50 shadow-sm hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-accent/5 transition-shadow relative overflow-hidden group hover:-translate-y-1 transition-transform">
      <div className="absolute top-0 right-0 p-8 opacity-5 transform translate-x-1/4 -translate-y-1/4 group-hover:scale-150 transition-transform duration-500 pointer-events-none">
        {icon}
      </div>
      <div className="w-14 h-14 rounded-2xl bg-light-bg dark:bg-dark-bg flex items-center justify-center mb-6 border border-light-border/50 dark:border-dark-border/50 shadow-sm">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-light-text dark:text-dark-text mb-3">{title}</h3>
      <p className="text-light-muted dark:text-dark-muted leading-relaxed">{description}</p>
    </div>
  )
}

function StepCard({ number, title, description }: { number: string, title: string, description: string }) {
  return (
    <div className="relative flex flex-col items-center group">
      <div className="w-20 h-20 rounded-2xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 flex items-center justify-center text-2xl font-bold text-accent shadow-xl mb-8 z-10 relative overflow-hidden group-hover:scale-110 transition-transform">
        <div className="absolute inset-0 bg-accent/5 group-hover:bg-accent/10 transition-colors" />
        {number}
      </div>
      <h3 className="text-2xl font-bold text-light-text dark:text-dark-text mb-4">{title}</h3>
      <p className="text-light-muted dark:text-dark-muted leading-relaxed max-w-xs">{description}</p>
    </div>
  )
}
