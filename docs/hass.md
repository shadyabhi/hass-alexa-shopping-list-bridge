# Home Assistant Setup

Explore the entities in Home Assistant UI, and create automations and dashboards as needed.

For ex, this card lists the count of items and also "sync delay". Personally,  I have automation set up that in case this delay in sensor is greater than a specified time, I send a mobile alert on my phone to fix it.

## Sync delay sensor

```yaml
sensor:
  - platform: template
    sensors:
      shopping_list_sync_delay:
        value_template: >-
          {% set raw_attr = state_attr('todo.amazon_shopping_list_shopping_list', 'last_successful_sync') %}
          {% if raw_attr is not none %}
            {% set clean_time = raw_attr.split(' (')[0] %}
            {% set last_sync = strptime(clean_time, '%a %b %d %Y %H:%M:%S GMT%z') %}
            {{ (now() - last_sync).total_seconds() | int }}
          {% else %}
            unknown
          {% endif %}
```

## Dashboard

```yaml
type: entities
entities:
  - entity: todo.amazon_shopping_list_shopping_list
    name: Amazon Shopping List
  - type: attribute
    entity: todo.amazon_shopping_list_shopping_list
    attribute: weekday_items_count
    name: Weekday Items
    icon: mdi:calendar-check
  - type: attribute
    entity: todo.amazon_shopping_list_shopping_list
    attribute: weekend_items_count
    name: Weekend Items
    icon: mdi:calendar-check
  - entity: sensor.shopping_list_last_success_delay
    name: Last successful sync
```

## Automation

- Monitoring stale data

```yaml
alias: "Shopping List: Alert if data is stale"
description: ""
triggers:
  - trigger: template
    value_template: >-
      {% set raw_attr = state_attr('todo.amazon_shopping_list_shopping_list',
      'last_successful_sync') %}

      {% set clean_time = raw_attr.split(' (')[0] if raw_attr is not none else
      none %}

      {% set last_sync = strptime(clean_time, '%a %b %d %Y %H:%M:%S GMT%z') if
      clean_time is not none else none %}

      {{ now() - last_sync > timedelta(minutes=10) }}
conditions: []
actions:
  - action: notify.my_family
    metadata: {}
    data:
      message: Fix shopping list integration
      title: Alert
mode: single
```

- Alert me if I am outside my house, and I've stuff to buy.

```yaml
alias: "Shopping List: Alert for weekday items"
description: ""
triggers:
  - trigger: state
    entity_id:
      - sensor.home_name1_distance
      - sensor.home_name2_distance
conditions:
  - condition: or
    conditions:
      - condition: numeric_state
        entity_id: sensor.home_abhijeet_distance
        above: 1000
      - condition: numeric_state
        entity_id: sensor.home_mansi_distance
        above: 1000
  - condition: template
    value_template: >-
      {{ state_attr('todo.amazon_shopping_list_shopping_list',
      'weekday_items_count') | int(0) > 0 }}
actions:
  - action: notify.my_family
    metadata: {}
    data:
      message: >-
        Announce: Weekday item exists, consider shopping while you're already
        out
      title: Shopping list
mode: single
```
