<svelte:options runes={false}/>
<script>
  import { fly } from 'svelte/transition';
  import { onMount } from 'svelte';

  import { Chart, registerables } from 'chart.js';
  Chart.register(...registerables);



  // --------------------
  // Miner Data
  // --------------------
  let miners = [
    { name: 'Antminer S19 Pro A', hashRate: 92, cost: 469, power: 2714 },
    { name: 'Whatsminer M50S', hashRate: 120, cost: 804, power: 3120 },
    { name: 'Proto Rig', hashRate: 819, cost: 4000, power: 12000 },
    { name: 'Whatsminer M60S+', hashRate: 204, cost: 3060, power: 3468 },
  ];

  let customMiner = { name: 'Custom Miner', hashRate: null, cost: null, power: null };

  let step = 1; // 1: Miner, 2: Capital, 3: Energy, 4: Regression, 5: Results
  let selectedMinerIndex = null; // 0,1,2 or 'custom'
  let capital = 10000;
  let energyPerDay = 100; // kWh
  let regressionConstant = 50; // 0-100
  let displayCurrency = 'USD';

  // Constants
  const btcPrice = 90000;
  const blockReward = 3.125;
  const blocksPerDay = 144;
  const networkHashRate = 1000000;
  const now = new Date();

  let actualPrice = btcPrice;
  let actualHash = networkHashRate;
  let investmentBTC = capital / actualPrice;
  let roiYearsUSD = null;
  let roiYearsBTC = null;


  let graphData = [];

  // --------------------
  // Reactive derived values
  // --------------------
  $: if (
    customMiner.hashRate &&
    customMiner.cost &&
    customMiner.power &&
    !miners.some(m => m.name === 'Custom Miner')
  ) {
    miners = [...miners, { ...customMiner }];
  }

  $: selectedMiner = selectedMinerIndex === 'custom' ? customMiner : miners[selectedMinerIndex];

  $: minerCount = selectedMiner ? Math.floor(capital / selectedMiner.cost) : 0;
  $: minerExactPrice = selectedMiner ? Math.floor(capital / selectedMiner.cost)*selectedMiner.cost : 0;
  $: totalHashRate = selectedMiner ? minerCount * selectedMiner.hashRate : 0;
  $: totalPower = selectedMiner ? minerCount * selectedMiner.power : 0;
  $: dailyEnergyNeeded = (totalPower * 24) / 1000; // kWh
  $: canRunFullPower = energyPerDay >= dailyEnergyNeeded;


  // --------------------
  // Halving calculations
  // --------------------
  const halvingIntervalMonths = 210000 / (blocksPerDay * 30.44);
  let lastHalvingDate = new Date('2024-04-19');
  function monthsSince(date) {
    return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
  }

  // --------------------
  // Power law predictions
  // --------------------
  function predictedPrice(month, currentDate) {
    const exponent = 5.2134794972530845;
    const multiplier = 1.6389041947611932e-15;

    const genesisDate = new Date("2009-01-03");

    // currentDate zaten Date → sadece kopya alıyoruz
    const targetDate = new Date(currentDate.getTime());
    targetDate.setMonth(targetDate.getMonth() + month);

    const diffMs = targetDate.getTime() - genesisDate.getTime();
    const daysSinceGenesis = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

    return multiplier * Math.pow(daysSinceGenesis, exponent);
  }

  function predictedHashRate(month, currentDate) {
    // Python'dan gelen sabitler
    const exponent = 4.491329780767128;
    const multiplier = 31592.26480208127;

    const beginningDate = new Date("2013-01-01");

    // currentDate zaten Date → kopya alıyoruz
    const targetDate = new Date(currentDate.getTime());
    targetDate.setMonth(targetDate.getMonth() + month);

    const diffMs = targetDate.getTime() - beginningDate.getTime();
    const daysSinceBeginning = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

    return multiplier * Math.pow(daysSinceBeginning, exponent) * 1e-12; // TH/s
  }

  // --------------------
  // Fetch actual price & hashrate
  // --------------------
  async function getActualPrice() {
    try {
      const res = await fetch('https://blockchain.info/q/24hrprice');
      const text = await res.text();
      return parseFloat(text) || btcPrice;
    } catch {
      return btcPrice;
    }
  }

  async function getActualHashRate() {
    try {
      const res = await fetch('https://blockchain.info/q/hashrate');
      const text = await res.text();
      return (parseFloat(text)/1000) || networkHashRate; // convert from GH/s to TH/s
    } catch {
      return networkHashRate;
    }
  }

  onMount(async () => {
    actualPrice = await getActualPrice();
    console.log('investmentBTC before:', investmentBTC);
    investmentBTC = capital / actualPrice;
    actualHash = await getActualHashRate();
    console.log('actualPrice:', actualPrice, 'actualHash:', actualHash, 'investmentBTC:', investmentBTC);
  });



  // --------------------
  // Generate graph data (simulation)
  // --------------------
  $: if (selectedMiner) {
    (async () => {
      const months = 61;
      const data = [];
      let blockRewardCurrent = blockReward;
      let investmentBTC = capital / actualPrice;

      for (let m = 0; m < months; m++) {
        const years = m / 12 || 1e-6;
        console.log('Month:', m, 'Years:', years);
        // ratio is the closeness to predicteds
        // magic number 1.45 makes result closer to prediction at 1st year
        const ratio = Math.exp(-1 / (regressionConstant * 0.01 * 1.45 * years + 1e-6));

        const priceMonth = actualPrice * (1 - ratio) + predictedPrice(m, now) * ratio;
        console.log('  Price prediction:', predictedPrice(m, now), 'Ratio:', ratio.toFixed(4), 'PriceMonth:', priceMonth.toFixed(2));
        const hashMonth = actualHash * (1 - ratio) + predictedHashRate(m, now) * ratio;

        const monthsSinceLastHalving = monthsSince(lastHalvingDate);

        if (m + monthsSinceLastHalving >= halvingIntervalMonths) {
          blockRewardCurrent = blockReward / 2;
        }

        const dailyBtcMonth = totalHashRate ? (totalHashRate / hashMonth) * blockRewardCurrent * blocksPerDay : 0;
        console.log('  Hash prediction:', predictedHashRate(m, now), 'Block Reward:', blockRewardCurrent.toFixed(4), 'HashMonth:', hashMonth.toFixed(2), 'DailyBTCMonth:', dailyBtcMonth.toFixed(6));
        const dailyRevenueUSDMonth = dailyBtcMonth * priceMonth;
        console.log('  Daily Revenue USD Month:', dailyRevenueUSDMonth.toFixed(2));
        const profitMonth = dailyRevenueUSDMonth * 30.44;
        
        //add up all month's profit in btc
        const profitBTCSum = data.reduce((sum, entry) => sum + entry.profitBTC, 0) + (profitMonth / priceMonth);
        const profitUSDSum = (data.reduce((sum, entry) => sum + entry.profitBTC, 0) + (profitMonth / priceMonth)) * priceMonth;

        data.push({
          month: m,
          investmentUSD: investmentBTC * priceMonth,
          profitUSD: profitMonth,
          investmentBTC: investmentBTC,
          profitBTC: profitMonth / priceMonth,
          price: priceMonth,
          networkHash: hashMonth,
          profitBTCSum: profitBTCSum,
          profitUSDSum: profitUSDSum
        });
      }

      for (const row of data) {
        const years = row.month / 12;

        if (roiYearsUSD === null && row.profitUSDSum >= capital) {
          roiYearsUSD = years;
        }

        if (roiYearsBTC === null && row.profitBTCSum >= investmentBTC) {
          roiYearsBTC = years;
        }
      }


      graphData = data;
    })();
  }

  const nextStep = () => { if (step < 5 && (step !== 1 || selectedMinerIndex !== null)) step++; };
  const prevStep = () => { if (step > 1) step--; };




  let chartCanvas;
  let chartInstance;

  function createOrUpdateChart() {
    if (!graphData.length || !chartCanvas) return;

    const labels = graphData.map(d => d.month);
    const profitData = graphData.map(d => displayCurrency === 'USD' ? d.profitUSDSum : d.profitBTCSum);
    const investmentData = graphData.map(d => displayCurrency === 'USD' ? d.investmentUSD : d.investmentBTC);

    if (chartInstance) {
      chartInstance.data.labels = labels;
      chartInstance.data.datasets[0].data = profitData;
      chartInstance.data.datasets[1].data = investmentData;
      chartInstance.options.scales.y.title.text = displayCurrency;
      chartInstance.update();
    } else {
      chartInstance = new Chart(chartCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Profit', data: profitData, borderColor: 'rgb(52, 211, 153)', backgroundColor: 'rgba(52, 211, 153, 0.15)', fill: false },
            { label: 'Investment', data: investmentData, borderColor: 'rgb(134, 111, 238)', backgroundColor: 'rgba(134, 111, 238, 0.15)', fill: false }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'top' } },
          scales: {
            x: { title: { display: true, text: 'Month' } },
            y: { title: { display: true, text: displayCurrency } }
          }
        }
      });
    }
  }

  // reactive olarak graphData veya displayCurrency değişince chartı güncelle
  $: graphData.length && chartCanvas && createOrUpdateChart();
  $: displayCurrency && createOrUpdateChart();

  onMount(() => {
    // canvas mount olduktan sonra chart oluştur
    if (graphData.length) createOrUpdateChart();
  });









</script>
<main class="h-screen w-screen overflow-hidden relative bg-gradient-to-br from-black via-slate-950 to-slate-900 p-4 text-cyan-100 font-mono">
  
  <!-- Step 1: Miner -->
  {#if step === 1}
    <div in:fly={{ y: 300, duration: 300 }} out:fly={{ y: -300, duration: 300 }} class="flex flex-col space-y-4">
      <h2 class="text-xl font-bold text-center mb-4 text-cyan-400 tracking-widest">CHOOSE YOUR MINER</h2>
      {#each miners as miner, i}
        <button
          class="w-full p-6 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 border border-cyan-500/30 shadow-[0_0_20px_rgba(0,255,255,0.15)] hover:shadow-[0_0_30px_rgba(0,255,255,0.35)] transition text-left"
          on:click={() => { selectedMinerIndex = i; nextStep(); }}>
          
          <div class="font-semibold text-lg text-cyan-300">{miner.name}</div>
          <div class="text-sm text-slate-300">Hash: {miner.hashRate} TH/s</div>
          <div class="text-sm text-slate-300">Cost: ${miner.cost}</div>
          <div class="text-sm text-slate-300">Power: {miner.power} W</div>
          <div class="text-sm text-emerald-400">
            Profitability Index: {(miner.hashRate / miner.cost).toFixed(4)} TH/s/$
          </div>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Step 2: Capital -->
  {#if step === 2}
    <div in:fly={{ y: 300, duration: 300 }} out:fly={{ y: -300, duration: 300 }} class="flex flex-col space-y-4">
      <h2 class="text-xl font-bold text-cyan-400 tracking-widest">CAPITAL</h2>
      <input
        type="number"
        bind:value={capital}
        min="0"
        step="100"
        class="w-full p-3 rounded-xl bg-black border border-cyan-500/40 text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"/>

      <div class="text-slate-300">
        Can buy: <span class="text-cyan-400">{minerCount}</span> units for
        <span class="text-cyan-400">${minerExactPrice}</span>, enter exact number for profitable results.
      </div>

      <div class="flex justify-between mt-4">
        <button class="px-4 py-2 rounded-xl bg-slate-800 border border-slate-600 text-slate-300" on:click={prevStep}>
          Back
        </button>
        <button class="px-4 py-2 rounded-xl bg-cyan-600 text-black font-bold shadow-[0_0_15px_rgba(0,255,255,0.4)]" on:click={nextStep}>
          Next
        </button>
      </div>
    </div>
  {/if}

  <!-- Step 3: Energy -->
  {#if step === 3}
    <div in:fly={{ y: 300, duration: 300 }} out:fly={{ y: -300, duration: 300 }} class="flex flex-col space-y-4">
      <h2 class="text-xl font-bold text-cyan-400 tracking-widest">ENERGY / DAY</h2>
      <input
        type="number"
        bind:value={energyPerDay}
        min="0"
        step="1"
        class="w-full p-3 rounded-xl bg-black border border-cyan-500/40 text-cyan-200"/>

      <div class="text-slate-300">
        Needed: <span class="text-cyan-400">{dailyEnergyNeeded.toFixed(2)}</span> kWh/day
      </div>

      <div class={canRunFullPower ? "text-emerald-400" : "text-red-400"}>
        {canRunFullPower
          ? 'Enough energy for all miners.'
          : 'Not enough energy for all miners.'}
      </div>

      <div class="flex justify-between mt-4">
        <button class="px-4 py-2 rounded-xl bg-slate-800 border border-slate-600 text-slate-300" on:click={prevStep}>
          Back
        </button>
        <button class="px-4 py-2 rounded-xl bg-cyan-600 text-black font-bold" on:click={nextStep}>
          Next
        </button>
      </div>
    </div>
  {/if}

  <!-- Step 4: Regression -->
  {#if step === 4}
    <div in:fly={{ y: 300, duration: 300 }} out:fly={{ y: -300, duration: 300 }} class="flex flex-col space-y-4">
      <h2 class="text-xl font-bold text-cyan-400 tracking-widest">REGRESSION LEVEL</h2>

      <input type="range" min="0" max="100" bind:value={regressionConstant} class="w-full accent-cyan-500"/>

      <div class="text-slate-300">
        <span class="text-cyan-400">{Math.round(regressionConstant)}%</span> — The amount of  BTC price & Hashrate prediction.<br><br>
        0 => constant current BTC price & hashrate values<br>
        100 => BTC price & Hashrate are closer to predictions after 1 year
      </div>

      <div class="flex justify-between mt-4">
        <button class="px-4 py-2 rounded-xl bg-slate-800 border border-slate-600 text-slate-300" on:click={prevStep}>
          Back
        </button>
        <button class="px-4 py-2 rounded-xl bg-cyan-600 text-black font-bold" on:click={nextStep}>
          Next
        </button>
      </div>
    </div>
  {/if}

  <!-- Step 5: Results -->
  {#if step === 5}
    <div class="space-y-4">
      <h2 class="text-xl font-bold text-cyan-400 tracking-widest">RESULTS</h2>

      <div class="text-slate-300">
        <label class="mr-4"><input type="radio" bind:group={displayCurrency} value="USD" /> USD</label>
        <label><input type="radio" bind:group={displayCurrency} value="BTC" /> BTC</label>
      </div>

      <div class="bg-black/60 border border-cyan-500/30 p-4 rounded-xl shadow-[0_0_25px_rgba(0,255,255,0.15)]">
        <strong class="text-cyan-400">Investment:</strong>
        {displayCurrency === 'USD'
          ? `$${capital.toFixed(2)}`
          : `${investmentBTC.toFixed(6)} BTC`}
        <br/>

        <strong class="text-emerald-400">ROI of USD:</strong> {roiYearsUSD.toFixed(2)} years<br/>
        <strong class="text-emerald-400">ROI of BTC:</strong> {roiYearsBTC.toFixed(2)} years
      </div>

      <div class="h-64 bg-black/80 border border-slate-700 rounded-xl p-2">
        <canvas bind:this={chartCanvas}></canvas>
      </div>

      <button class="mt-4 px-4 py-2 bg-slate-800 border border-slate-600 rounded-xl text-slate-300" on:click={prevStep}>
        Back
      </button>
    </div>
  {/if}

</main>

<style>
  @reference "tailwindcss";
</style>
