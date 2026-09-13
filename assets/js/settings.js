const themeToggle = document.querySelector('#themeToggle');
const savedTheme = localStorage.getItem('caseTrackTheme') || 'dark';
const themeSwitch = document.querySelector('#themeSwitch');

const applyTheme = theme => {
    const isLight = theme === 'light';
    document.body.classList.toggle('light-theme', isLight);

    if (themeToggle) {
        themeToggle.textContent = isLight ? '☾' : '☼';
        themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
        themeToggle.setAttribute('aria-pressed', String(isLight));
    }

    if (themeSwitch) {
        themeSwitch.checked = isLight;
    }
};

applyTheme(savedTheme);

themeToggle?.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
    localStorage.setItem('caseTrackTheme', nextTheme);
    applyTheme(nextTheme);
});

themeSwitch?.addEventListener('change', () => {
    const nextTheme = themeSwitch.checked ? 'light' : 'dark';
    localStorage.setItem('caseTrackTheme', nextTheme);
    applyTheme(nextTheme);
});
