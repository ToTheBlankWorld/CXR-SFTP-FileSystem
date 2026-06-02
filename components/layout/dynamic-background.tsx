export function DynamicBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {/* Background base */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-background/95" />

      {/* Primary ambient light */}
      <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-transparent to-transparent" />

      {/* Secondary ambient light */}
      <div className="absolute inset-0 bg-gradient-to-bl from-transparent via-transparent to-secondary/15" />

      {/* Accent ambient light */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/10 to-transparent" />

      {/* Radial soft light */}
      <div className="absolute inset-0 bg-radial-gradient from-primary/5 via-transparent to-background/50" />

      {/* Mesh gradients using pure radial-gradients for high performance (no expensive CSS blur filter) */}
      <div className="absolute inset-0 opacity-30">
        <div 
          className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full" 
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)',
          }}
        />
        <div 
          className="absolute bottom-1/3 right-1/4 w-[450px] h-[450px] rounded-full" 
          style={{
            background: 'radial-gradient(circle, hsl(var(--accent) / 0.1) 0%, transparent 70%)',
          }}
        />
        <div 
          className="absolute top-1/2 right-1/3 w-[350px] h-[350px] rounded-full" 
          style={{
            background: 'radial-gradient(circle, hsl(var(--secondary) / 0.15) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(hsl(var(--muted-foreground)) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--muted-foreground)) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
    </div>
  )
}
