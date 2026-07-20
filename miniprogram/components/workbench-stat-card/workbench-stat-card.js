Component({
  options: { addGlobalClass: true },
  properties: {
    card: { type: Object, value: null },
  },
  methods: {
    onCardTap() {
      const card = this.properties.card;
      if (card && card.type === 'finance_stats' && !card.loading && !card.noPermission) {
        this.triggerEvent('detailtap', { type: card.type });
      }
    },
  },
});
