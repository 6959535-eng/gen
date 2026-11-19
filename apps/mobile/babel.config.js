module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Міграції Drizzle — .sql-файли, що вбудовуються в бандл як рядки
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
