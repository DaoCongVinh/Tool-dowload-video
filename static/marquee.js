class LinearMarquee {
  constructor(container, options = {}) {
    this.container = container;
    this.text = options.text || "Hello there! How's it going? Welcome to MediaDL";
    this.speed = options.speed || 1;
    this.direction = options.direction || "left";
    this.interactive = options.interactive !== false;
    this.className = options.className || "fill-gray-900 dark:fill-white";
    
    this.tspans = [];
    this.isDragging = false;
    this.lastX = 0;
    this.velocity = 0;
    this.currentDirection = this.direction;
    this.pathLength = 0;
    this.spacing = 0;
    this.frameId = null;
    
    this.init();
  }

  init() {
    // Add trailing space if needed
    const hasTrailing = /\s|\u00A0$/.test(this.text);
    this.processedText = (hasTrailing ? this.text.replace(/\s+$/, "") : this.text) + "\u00A0";
    
    this.createSVG();
    this.measure();
    this.setupEvents();
    this.animate();
  }

  createSVG() {
    const uid = Math.random().toString(36).substr(2, 9);
    this.pathId = `linear-path-${uid}`;
    
    this.container.innerHTML = `
      <svg class="marquee-svg select-none w-full overflow-visible block" viewBox="0 0 1440 160" style="cursor: ${this.interactive ? 'grab' : 'auto'}">
        <text id="measure-${uid}" xml:space="preserve" style="visibility: hidden; opacity: 0; pointer-events: none;">
          ${this.processedText}
        </text>
        <defs>
          <path id="${this.pathId}" d="M-100,90 L1540,90" fill="none" stroke="transparent" />
        </defs>
        <text xml:space="preserve" class="${this.className}">
          <textPath href="#${this.pathId}" xml:space="preserve" id="textpath-${uid}">
          </textPath>
        </text>
      </svg>
    `;

    this.svg = this.container.querySelector('svg');
    this.measureText = this.container.querySelector(`#measure-${uid}`);
    this.path = this.container.querySelector(`#${this.pathId}`);
    this.textPath = this.container.querySelector(`#textpath-${uid}`);
  }

  measure() {
    // Measure text spacing
    if (this.measureText) {
      this.spacing = this.measureText.getComputedTextLength();
    }
    
    // Get path length
    if (this.path) {
      this.pathLength = this.path.getTotalLength();
    }

    // Calculate repeats needed
    if (this.pathLength && this.spacing) {
      this.repeats = Math.ceil(this.pathLength / this.spacing) + 2;
      this.createTspans();
    }
  }

  createTspans() {
    this.textPath.innerHTML = '';
    this.tspans = [];
    
    for (let i = 0; i < this.repeats; i++) {
      const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan.textContent = this.processedText;
      tspan.setAttribute('x', (i * this.spacing).toString());
      tspan.setAttribute('xml:space', 'preserve');
      this.textPath.appendChild(tspan);
      this.tspans.push(tspan);
    }

    // Show container after setup
    this.container.style.visibility = 'visible';
  }

  setupEvents() {
    if (!this.interactive) return;

    this.svg.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.lastX = e.clientX;
      this.velocity = 0;
      this.svg.style.cursor = 'grabbing';
      this.svg.setPointerCapture(e.pointerId);
    });

    this.svg.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      
      const dx = e.clientX - this.lastX;
      this.lastX = e.clientX;
      this.velocity = dx;

      this.tspans.forEach(tspan => {
        let x = parseFloat(tspan.getAttribute('x') || '0');
        x += dx;
        
        const totalWidth = this.tspans.length * this.spacing;
        if (x < -this.spacing) {
          x = x + totalWidth;
        }
        if (x > totalWidth - this.spacing) {
          x = x - totalWidth;
        }
        
        tspan.setAttribute('x', x.toString());
      });
    });

    const endDrag = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.svg.style.cursor = 'grab';
      
      if (Math.abs(this.velocity) > 1) {
        this.currentDirection = this.velocity > 0 ? 'right' : 'left';
      }
    };

    this.svg.addEventListener('pointerup', endDrag);
    this.svg.addEventListener('pointerleave', endDrag);
  }

  animate() {
    const step = () => {
      if (!this.spacing) return;

      this.tspans.forEach(tspan => {
        let x = parseFloat(tspan.getAttribute('x') || '0');
        
        if (!this.isDragging) {
          const delta = this.currentDirection === 'right' 
            ? Math.abs(this.speed) 
            : -Math.abs(this.speed);
          x += delta;
        }

        const totalWidth = this.tspans.length * this.spacing;
        if (x < -this.spacing) {
          x = x + totalWidth;
        }
        if (x > totalWidth - this.spacing) {
          x = x - totalWidth;
        }

        tspan.setAttribute('x', x.toString());
      });

      this.frameId = requestAnimationFrame(step);
    };

    step();
  }

  destroy() {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }
  }
}

// Auto-initialize marquees on page load
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-marquee]').forEach(element => {
    const text = element.getAttribute('data-marquee-text') || "Hello there! How's it going? Welcome to MediaDL";
    const speed = parseFloat(element.getAttribute('data-marquee-speed')) || 1;
    const direction = element.getAttribute('data-marquee-direction') || 'left';
    const interactive = element.getAttribute('data-marquee-interactive') !== 'false';
    
    new LinearMarquee(element, { text, speed, direction, interactive });
  });
});

