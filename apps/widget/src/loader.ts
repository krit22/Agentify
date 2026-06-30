import { init } from './index'
import styles from './index.css?inline'

function bootstrap() {
  // 1. Locate script tag and extract parameters
  const scriptEl = document.currentScript as HTMLScriptElement || document.querySelector('script[src*="widget.js"]')
  if (!scriptEl) {
    console.error('[Aegis Widget] Script element could not be found in DOM.')
    return
  }

  const orgId = scriptEl.getAttribute('data-org-id')
  if (!orgId) {
    console.error('[Aegis Widget] Missing required attribute "data-org-id". Ingestion halted.')
    return
  }

  const containerId = scriptEl.getAttribute('data-container-id')
  const isInline = !!containerId

  // 2. Resolve API server URL based on where script was fetched from
  const apiHost = new URL(scriptEl.src).origin

  // 3. Fetch branding settings and perform cross-origin whitelist verification
  fetch(`${apiHost}/api/widget/config?orgId=${orgId}`)
    .then((res) => {
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Forbidden: Host origin is not whitelisted.')
        } else if (res.status === 404) {
          throw new Error('Not Found: Organization context does not exist.')
        }
        throw new Error('Failed to load widget config profile.')
      }
      return res.json()
    })
    .then((config) => {
      const brandColor = config.brandColor || '#18181b'
      const greetingMessage = config.greetingMessage || 'Hello! How can we help you today?'
      const escalationSLAHours = config.escalationSLAHours || 24

      // 4. Resolve mounting target container (body for floating widget or custom element for inline)
      let mountParent: HTMLElement | null = null
      if (isInline) {
        mountParent = document.getElementById(containerId)
        if (!mountParent) {
          console.error(`[Aegis Widget] Custom container element "#${containerId}" not found in DOM.`)
          return
        }
      } else {
        mountParent = document.createElement('aegis-widget-root')
        // Enforce float positioning on wrapper container
        Object.assign(mountParent.style, {
          position: 'fixed',
          bottom: '0',
          right: '0',
          zIndex: '99999',
          pointerEvents: 'none' // Allow background elements to handle clicks
        })
        document.body.appendChild(mountParent)
      }

      // 5. Construct Closed Shadow DOM boundary
      const shadowRoot = mountParent.attachShadow({ mode: 'closed' })

      // 6. Inject compiled CSS style sheet into Shadow DOM
      const styleNode = document.createElement('style')
      styleNode.textContent = styles
      shadowRoot.appendChild(styleNode)

      // 7. Construct mount wrapper container (re-enable pointerEvents inside widget itself)
      const mountWrapper = document.createElement('div')
      if (!isInline) {
        Object.assign(mountWrapper.style, {
          pointerEvents: 'auto'
        })
      } else {
        Object.assign(mountWrapper.style, {
          width: '100%',
          height: '100%'
        })
      }
      shadowRoot.appendChild(mountWrapper)

      // 8. Hydrate Preact application root
      init(mountWrapper, {
        orgId,
        apiHost,
        brandColor,
        greetingMessage,
        escalationSLAHours,
        isInline
      })
    })
    .catch((err) => {
      console.warn(`[Aegis Widget] Loader initialization blocked: ${err.message}`)
    })
}

// Fire bootstrap routine
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  bootstrap()
} else {
  window.addEventListener('DOMContentLoaded', bootstrap)
}
