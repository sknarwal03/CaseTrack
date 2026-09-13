const themeToggle = document.querySelector('#themeToggle');
const savedTheme = localStorage.getItem('caseTrackTheme') || 'dark';

const applyTheme = theme => {
    const isLight = theme === 'light';
    document.body.classList.toggle('light-theme', isLight);
    if (themeToggle) {
        themeToggle.textContent = isLight ? '☾' : '☼';
        themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
        themeToggle.setAttribute('aria-pressed', String(isLight));
    }
};

applyTheme(savedTheme);

themeToggle?.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
    localStorage.setItem('caseTrackTheme', nextTheme);
    applyTheme(nextTheme);
});

const filterButtons = document.querySelectorAll('.po-filter');
const tableRows = document.querySelectorAll('.po-row');

filterButtons.forEach(button => {
    button.addEventListener('click', () => {
        const filter = button.dataset.filter;
        filterButtons.forEach(btn => btn.classList.toggle('active', btn === button));

        tableRows.forEach(row => {
            const matches = filter === 'all' || row.dataset.status === filter;
            row.style.display = matches ? '' : 'none';
        });
    });
});
