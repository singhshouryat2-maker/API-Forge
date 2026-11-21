// TiDB Cloud only accepts SSL connections, so turn SSL on for it automatically
function dbUrl() {
  let url = process.env.DATABASE_URL || '';
  if (url.includes('tidbcloud') && !url.includes('ssl')) {
    url += (url.includes('?') ? '&' : '?') + 'sslaccept=strict';
  }
  return url;
}

module.exports = dbUrl;
