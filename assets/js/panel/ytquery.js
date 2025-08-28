document.addEventListener('DOMContentLoaded', () => {
    const ytQueryButton = document.getElementById('ytQueryButton')
    const ytQueryModal = document.getElementById('ytQueryModal')
    const ytQueryModalClose = document.getElementById('ytQueryModalClose')
    const ytQueryModalBackdrop = document.getElementById('ytQueryModalBackdrop')
    const ytQueryInput = document.getElementById('ytQueryInput')
    const ytQueryDisplay = document.getElementById('ytQueryDisplay')
    const ytQueryApplyBtn = document.getElementById('ytQueryApplyBtn')

    let queries = new Set()

    const openModal = () => {
        ytQueryModal.classList.remove('hidden')
        ytQueryInput.focus()
    }

    const closeModal = () => {
        ytQueryModal.classList.add('hidden')
        ytQueryInput.value = ''
    }

    const renderQueries = () => {
        ytQueryDisplay.innerHTML = ''
        queries.forEach(query => {
            const tag = document.createElement('div')
            tag.className = 'group inline-flex items-center bg-primary/10 hover:bg-primary/20 rounded-full px-3 py-1 m-1 transition-colors'
            tag.dataset.query = query

            const text = document.createElement('span')
            text.className = 'text-sm font-medium'
            text.textContent = query

            const removeBtn = document.createElement('button')
            removeBtn.className = 'ml-1.5 text-text-light/60 hover:text-status-error-light dark:text-text-color/60 dark:hover:text-status-error-dark opacity-0 group-hover:opacity-100 transition-opacity'
            removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
            
            removeBtn.onclick = (e) => {
                e.stopPropagation()
                queries.delete(query)
                renderQueries()
            }

            tag.appendChild(text)
            tag.appendChild(removeBtn)
            ytQueryDisplay.appendChild(tag)
        })
    }

    ytQueryButton.addEventListener('click', openModal)
    ytQueryModalClose.addEventListener('click', closeModal)
    ytQueryModalBackdrop.addEventListener('click', closeModal)
    ytQueryApplyBtn.addEventListener('click', closeModal)

    if (ytQueryInput && ytQueryDisplay) {
        ytQueryInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault()
                const query = ytQueryInput.value.trim()
                if (query) {
                    queries.add(query)
                    ytQueryInput.value = ''
                    renderQueries()
                }
            }
        })

        ytQueryInput.addEventListener('input', (e) => {
            const query = e.target.value.trim()
            if (query.endsWith(' ')) {
                queries.add(query.slice(0, -1))
                e.target.value = ''
                renderQueries()
            }
        })
    }

    const getQueries = () => Array.from(queries)
}) 