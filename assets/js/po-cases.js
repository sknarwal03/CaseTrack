/* Theme handled by shared-layout.js */

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
