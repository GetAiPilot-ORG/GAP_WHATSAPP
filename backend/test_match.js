function test() {
    const item = {
        matchType: 'exact',
        triggers: ['TELEGRAM']
    };
    const normalized = 'telegram ki service chahiye';

    // Phase 1
    let isMatch1 = false;
    if (item.matchType === 'exact') {
        isMatch1 = item.triggers.some((t) => {
            const keyword = t.toLowerCase().trim();
            return keyword && normalized === keyword;
        });
    }
    console.log('Phase 1 isMatch:', isMatch1);

    // Phase 2
    let isMatch2 = false;
    if (item.matchType !== 'exact') {
        isMatch2 = item.triggers.some((t) => {
            const keyword = t.toLowerCase().trim();
            return keyword && normalized.includes(keyword);
        });
    }
    console.log('Phase 2 isMatch:', isMatch2);
}
test();
