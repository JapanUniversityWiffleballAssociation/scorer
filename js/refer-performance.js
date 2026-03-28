document.addEventListener('DOMContentLoaded', () => {
    onLoad();
});

function onLoad() {

}

async function getLeagues(){
    const res = await fetch(`${GAS_URL}?mode=getLeagues`);
    const leagues = await res.json();
    
}