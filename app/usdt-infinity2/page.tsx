  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-gradient-to-br from-blue-950 via-gray-900 to-gray-800 py-12 px-4">
      <div className="w-full max-w-3xl mx-auto mb-10">
        <a href="/" className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-200 font-semibold px-4 py-2 rounded-lg bg-gray-800/70 border border-blue-700 shadow transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          Voltar
        </a>
        <h1 className="text-4xl md:text-5xl font-extrabold text-white drop-shadow mt-8 mb-2 text-center">
          USDT Infinity <span className="font-normal text-blue-300">– Arbitragem Cross-Exchange</span>
        </h1>
        <p className="text-gray-300 mb-8 text-lg text-center">Simule oportunidades de arbitragem entre exchanges globais. Informe o valor desejado para simular o lucro estimado.</p>
        <form className="flex flex-col md:flex-row items-center gap-4 mb-10 bg-gray-800/80 rounded-2xl p-8 shadow-xl w-full">
          <label className="text-gray-200 font-semibold mr-2 text-lg" htmlFor="capital">Valor para simulação (USDT):</label>
          <input
            id="capital"
            type="number"
            min={10}
            step={10}
            value={100}
            className="w-40 px-4 py-3 rounded-xl border border-gray-700 bg-gray-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xl font-mono"
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-xl shadow-lg text-lg transition-all"
          >Simular</button>
        </form>
        <div className="flex flex-col md:flex-row md:items-center gap-6 mb-12 w-full">
          <div className="flex-1 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center gap-4">
            <span className="text-gray-400 text-lg">Valor simulado:</span>
            <span className="text-3xl font-extrabold text-blue-400 font-mono">100 USDT</span>
          </div>
          <span className="text-blue-400 font-semibold animate-pulse block text-lg">Buscando oportunidades...</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
          <div className="bg-gray-900/80 rounded-2xl p-8 shadow-xl flex flex-col items-center">
            <div className="text-5xl mb-4">😕</div>
            <div className="text-gray-300 text-center text-lg">Nenhuma oportunidade encontrada para o valor informado.<br/>Tente outro valor ou aguarde novas oportunidades.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
